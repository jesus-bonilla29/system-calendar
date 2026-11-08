import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNotNull, isNull, lte, gte, notInArray, or } from 'drizzle-orm'
import type { AppDb } from '../db'
import { items, recurrences, reminders, scheduledTriggers, settings } from '../db/schema'
import { expandOccurrences } from '../../shared/recurrence'

const MIN = 60_000
const INACTIVE = ['done', 'cancelled', 'skipped'] as const
const LAST_TICK_KEY = 'scheduler.lastTickAt'

/** Lo que necesita la interfaz de aviso para mostrar y resolver un recordatorio. */
export interface TriggerView {
  id: string
  itemId: string
  title: string
  occurrenceStart: number
  fireAt: number
  offsetMinutes: number
  snoozeCount: number
  snoozeMinutes: number
  maxSnoozes: number
  canSnooze: boolean
}

export interface Notifier {
  notify(trigger: TriggerView): void
}

export interface SchedulerOptions {
  /** Cuánto por delante se materializan disparos. */
  horizonMs: number
  /** Retraso máximo con el que aún se avisa; más allá, el aviso se da por perdido. */
  graceMs: number
  /** Cuánto hacia atrás se busca lo perdido al arrancar o reanudar. */
  maxLookbackMs: number
  tickMs: number
  /** Cada cuánto se vuelve a materializar el horizonte. */
  resyncMs: number
}

export const DEFAULT_OPTIONS: SchedulerOptions = {
  horizonMs: 48 * 60 * MIN,
  graceMs: 2 * MIN,
  maxLookbackMs: 7 * 24 * 60 * MIN,
  tickMs: 15_000,
  resyncMs: 5 * MIN
}

export interface SchedulerDeps {
  db: AppDb
  notifier: Notifier
  now?: () => number
  newId?: () => string
  isQuiet?: (instant: number) => boolean
  options?: Partial<SchedulerOptions>
  log?: (msg: string, err?: unknown) => void
}

/**
 * Scheduler persistente de recordatorios.
 *
 * - Los disparos viven en SQLite (`scheduled_triggers`): sobreviven a reinicios.
 * - No usa un temporizador largo: un tick corto compara siempre con el reloj real, así que
 *   los saltos de hora (suspensión, cambio manual, NTP) se detectan solos.
 * - Lo que venció sin avisar (app cerrada, suspensión, salto adelante) se marca `missed`
 *   y se devuelve en `listMissed()`; nunca se ignora.
 */
export class Scheduler {
  private readonly db: AppDb
  private readonly notifier: Notifier
  private readonly now: () => number
  private readonly newId: () => string
  private readonly isQuiet: (instant: number) => boolean
  private readonly opt: SchedulerOptions
  private readonly log: (msg: string, err?: unknown) => void
  private timer: NodeJS.Timeout | null = null
  private lastTick: number | null = null
  private lastSync = 0

  constructor(deps: SchedulerDeps) {
    this.db = deps.db
    this.notifier = deps.notifier
    this.now = deps.now ?? Date.now
    this.newId = deps.newId ?? randomUUID
    this.isQuiet = deps.isQuiet ?? (() => false)
    this.opt = { ...DEFAULT_OPTIONS, ...deps.options }
    this.log = deps.log ?? (() => undefined)
  }

  /** Recupera lo perdido desde la última vez y empieza a vigilar. */
  start(): TriggerView[] {
    const missed = this.recover()
    this.timer = setInterval(() => this.tick(), this.opt.tickMs)
    return missed
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Arranque o reanudación tras suspensión: materializa desde el último latido, clasifica lo
   * vencido (avisa lo reciente, marca como perdido lo antiguo) y devuelve lo no reconocido.
   */
  recover(): TriggerView[] {
    const now = this.now()
    const last = this.readLastTick()
    const from = last === null ? now : Math.max(Math.min(last, now), now - this.opt.maxLookbackMs)
    this.sync(from)
    this.lastTick = now
    this.tick()
    return this.listMissed()
  }

  /** Un latido: procesa lo vencido y mantiene al día el horizonte. */
  tick(): void {
    const now = this.now()
    const last = this.lastTick ?? this.readLastTick() ?? now

    // Salto de reloj: hacia atrás, o hacia delante más de lo que justifica un tick normal.
    const jumped = now < last || now - last > this.opt.tickMs * 4
    if (jumped) {
      this.log(`Salto de reloj detectado (${now - last} ms)`)
      this.sync(Math.max(Math.min(last, now), now - this.opt.maxLookbackMs))
    } else if (now - this.lastSync >= this.opt.resyncMs) {
      this.sync(now)
    }

    const due = this.db
      .select()
      .from(scheduledTriggers)
      .where(and(eq(scheduledTriggers.status, 'pending'), lte(scheduledTriggers.fireAt, now)))
      .orderBy(asc(scheduledTriggers.fireAt))
      .all()

    for (const t of due) {
      if (now - t.fireAt > this.opt.graceMs) {
        this.setStatus(t.id, 'missed')
      } else if (this.isQuiet(t.fireAt)) {
        this.setStatus(t.id, 'silenced')
      } else {
        this.db
          .update(scheduledTriggers)
          .set({ status: 'fired', firedAt: now })
          .where(eq(scheduledTriggers.id, t.id))
          .run()
        const view = this.view(t.id)
        if (view) {
          try {
            this.notifier.notify(view)
          } catch (err) {
            this.log('El aviso falló', err)
          }
        }
      }
    }

    this.lastTick = now
    this.writeLastTick(now)
  }

  /**
   * Reconcilia los disparos con el estado actual de ítems, recurrencias y recordatorios para
   * la ventana [from, ahora + horizonte]. Idempotente. Llamar tras editar ítems.
   */
  sync(from: number = this.now()): void {
    const now = this.now()
    const to = now + this.opt.horizonMs
    this.lastSync = now

    const rows = this.db
      .select({ rem: reminders, item: items, rec: recurrences })
      .from(reminders)
      .innerJoin(items, eq(items.id, reminders.itemId))
      .leftJoin(recurrences, eq(recurrences.itemId, items.id))
      .where(and(isNotNull(items.startAt), notInArray(items.status, [...INACTIVE])))
      .all()

    const desired = new Map<
      string,
      { reminderId: string; itemId: string; occurrenceStart: number; fireAt: number }
    >()
    for (const { rem, item, rec } of rows) {
      const startAt = item.startAt as number
      const offset = rem.offsetMinutes * MIN
      const starts = rec
        ? expandOccurrences({
            rrule: rec.rrule,
            timezone: rec.timezone,
            startAt,
            exceptions: rec.exceptions,
            from: from + offset,
            to: to + offset
          })
        : startAt >= from + offset && startAt <= to + offset
          ? [startAt]
          : []
      for (const s of starts) {
        desired.set(`${rem.id}:${s}`, {
          reminderId: rem.id,
          itemId: item.id,
          occurrenceStart: s,
          fireAt: s - offset
        })
      }
    }

    this.db.transaction((tx) => {
      // 1. Quitar avisos pendientes que ya no corresponden.
      tx.delete(scheduledTriggers)
        .where(
          and(
            eq(scheduledTriggers.status, 'pending'),
            or(
              isNull(scheduledTriggers.reminderId),
              inArray(
                scheduledTriggers.itemId,
                tx
                  .select({ id: items.id })
                  .from(items)
                  .where(inArray(items.status, [...INACTIVE]))
              )
            )
          )
        )
        .run()

      const pending = tx
        .select()
        .from(scheduledTriggers)
        .where(
          and(
            eq(scheduledTriggers.status, 'pending'),
            gte(scheduledTriggers.fireAt, from),
            lte(scheduledTriggers.fireAt, to)
          )
        )
        .all()
      for (const t of pending) {
        const want = desired.get(`${t.reminderId}:${t.occurrenceStart}`)
        if (!want) {
          // Un aviso pospuesto conserva su hora aunque la original ya no esté en la ventana.
          if (t.snoozeCount === 0) {
            tx.delete(scheduledTriggers).where(eq(scheduledTriggers.id, t.id)).run()
          }
        } else if (t.snoozeCount === 0 && t.fireAt !== want.fireAt) {
          tx.update(scheduledTriggers)
            .set({ fireAt: want.fireAt })
            .where(eq(scheduledTriggers.id, t.id))
            .run()
        }
      }

      // 2. Crear los que faltan (sin tocar los ya avisados, perdidos o resueltos).
      for (const w of desired.values()) {
        tx.insert(scheduledTriggers)
          .values({ id: this.newId(), kind: 'reminder', ...w })
          .onConflictDoNothing()
          .run()
      }
    })
  }

  /** Pospone un aviso ya mostrado. Devuelve la nueva hora, o null si no se puede. */
  snooze(id: string): number | null {
    const view = this.view(id)
    if (!view || !view.canSnooze) return null
    const row = this.db.select().from(scheduledTriggers).where(eq(scheduledTriggers.id, id)).get()
    if (!row || (row.status !== 'fired' && row.status !== 'pending')) return null
    const fireAt = this.now() + view.snoozeMinutes * MIN
    this.db
      .update(scheduledTriggers)
      .set({ status: 'pending', fireAt, snoozeCount: row.snoozeCount + 1 })
      .where(eq(scheduledTriggers.id, id))
      .run()
    return fireAt
  }

  /** Marca el aviso como atendido. Devuelve el ítem afectado, o null si no existe. */
  resolve(id: string, outcome: 'started' | 'dismissed'): string | null {
    const row = this.db.select().from(scheduledTriggers).where(eq(scheduledTriggers.id, id)).get()
    if (!row) return null
    this.setStatus(id, outcome)
    return row.itemId
  }

  /** Avisos perdidos o silenciados que el usuario aún no ha visto. */
  listMissed(): (TriggerView & { status: 'missed' | 'silenced' })[] {
    const rows = this.db
      .select({ id: scheduledTriggers.id, status: scheduledTriggers.status })
      .from(scheduledTriggers)
      .where(
        and(
          inArray(scheduledTriggers.status, ['missed', 'silenced']),
          isNull(scheduledTriggers.acknowledgedAt)
        )
      )
      .orderBy(asc(scheduledTriggers.fireAt))
      .all()
    const result: (TriggerView & { status: 'missed' | 'silenced' })[] = []
    for (const r of rows) {
      const v = this.view(r.id)
      if (v) result.push({ ...v, status: r.status as 'missed' | 'silenced' })
    }
    return result
  }

  acknowledgeMissed(ids?: string[]): void {
    const where = and(
      inArray(scheduledTriggers.status, ['missed', 'silenced']),
      isNull(scheduledTriggers.acknowledgedAt),
      ids ? inArray(scheduledTriggers.id, ids) : undefined
    )
    this.db.update(scheduledTriggers).set({ acknowledgedAt: this.now() }).where(where).run()
  }

  view(id: string): TriggerView | null {
    const row = this.db
      .select({ t: scheduledTriggers, item: items, rem: reminders })
      .from(scheduledTriggers)
      .innerJoin(items, eq(items.id, scheduledTriggers.itemId))
      .leftJoin(reminders, eq(reminders.id, scheduledTriggers.reminderId))
      .where(eq(scheduledTriggers.id, id))
      .get()
    if (!row) return null
    const snoozeMinutes = row.rem?.snoozePolicy.minutes ?? 10
    const maxSnoozes = row.rem?.snoozePolicy.maxSnoozes ?? 3
    return {
      id: row.t.id,
      itemId: row.item.id,
      title: row.item.title,
      occurrenceStart: row.t.occurrenceStart,
      fireAt: row.t.fireAt,
      offsetMinutes: row.rem?.offsetMinutes ?? 0,
      snoozeCount: row.t.snoozeCount,
      snoozeMinutes,
      maxSnoozes,
      canSnooze: row.t.snoozeCount < maxSnoozes
    }
  }

  private setStatus(id: string, status: (typeof scheduledTriggers.$inferSelect)['status']): void {
    this.db.update(scheduledTriggers).set({ status }).where(eq(scheduledTriggers.id, id)).run()
  }

  private readLastTick(): number | null {
    const row = this.db.select().from(settings).where(eq(settings.key, LAST_TICK_KEY)).get()
    return typeof row?.value === 'number' ? row.value : null
  }

  private writeLastTick(value: number): void {
    this.db
      .insert(settings)
      .values({ key: LAST_TICK_KEY, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run()
  }
}
