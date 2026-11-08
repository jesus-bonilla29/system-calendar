import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { AppDb } from '../db'
import { activityLogs, items, recurrences, reminders } from '../db/schema'
import type { ItemStatus } from '../../shared/constants'
import type {
  ItemDetailDto,
  ItemDto,
  ItemWithRecurrenceInput,
  OccurrenceDto,
  RecurrenceDto,
  ReminderDto,
  ReminderInput
} from '../../shared/domain'
import { expandOccurrences } from '../../shared/recurrence'

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no encontrado`)
    this.name = 'NotFoundError'
  }
}

type ItemRow = typeof items.$inferSelect
type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0]

export class AgendaService {
  constructor(
    private readonly db: AppDb,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID
  ) {}

  create(data: ItemWithRecurrenceInput): ItemDetailDto {
    const id = this.newId()
    const now = this.now()
    this.db.transaction((tx) => {
      tx.insert(items)
        .values({
          id,
          ...data.item,
          completedAt: data.item.status === 'done' ? now : null,
          createdAt: now,
          updatedAt: now
        })
        .run()
      if (data.recurrence) {
        tx.insert(recurrences)
          .values({ id: this.newId(), itemId: id, ...data.recurrence, exceptions: [] })
          .run()
      }
      for (const r of data.reminders ?? []) this.insertReminder(tx, id, r)
      tx.insert(activityLogs)
        .values({
          id: this.newId(),
          itemId: id,
          fromStatus: null,
          toStatus: data.item.status,
          at: now,
          note: 'Creado'
        })
        .run()
    })
    return this.requireDetail(id)
  }

  get(id: string): ItemDetailDto | null {
    const item = this.db.select().from(items).where(eq(items.id, id)).get()
    if (!item) return null
    return {
      item: toItemDto(item),
      recurrence: this.getRecurrence(id),
      reminders: this.getReminders(id)
    }
  }

  update(id: string, data: ItemWithRecurrenceInput): ItemDetailDto {
    const now = this.now()
    this.db.transaction((tx) => {
      const current = tx.select().from(items).where(eq(items.id, id)).get()
      if (!current) throw new NotFoundError('Elemento')
      const input = data.item
      tx.update(items)
        .set({
          ...input,
          completedAt: completedAtFor(current, input.status, now),
          updatedAt: now
        })
        .where(eq(items.id, id))
        .run()
      if (current.status !== input.status) {
        tx.insert(activityLogs)
          .values({
            id: this.newId(),
            itemId: id,
            fromStatus: current.status,
            toStatus: input.status,
            at: now,
            note: null
          })
          .run()
      }

      const oldRec = tx.select().from(recurrences).where(eq(recurrences.itemId, id)).get()
      if (!data.recurrence) {
        if (oldRec) tx.delete(recurrences).where(eq(recurrences.itemId, id)).run()
      } else {
        // Las excepciones son instantes concretos: solo valen si no se movió el inicio ni la zona.
        const keep =
          oldRec &&
          current.startAt === input.startAt &&
          oldRec.timezone === data.recurrence.timezone
        const exceptions = keep ? oldRec.exceptions : []
        if (oldRec) {
          tx.update(recurrences)
            .set({ ...data.recurrence, exceptions })
            .where(eq(recurrences.itemId, id))
            .run()
        } else {
          tx.insert(recurrences)
            .values({ id: this.newId(), itemId: id, ...data.recurrence, exceptions })
            .run()
        }
      }

      this.replaceReminders(tx, id, data.reminders ?? [])
    })
    return this.requireDetail(id)
  }

  delete(id: string): boolean {
    return this.db.delete(items).where(eq(items.id, id)).run().changes > 0
  }

  setStatus(id: string, status: ItemStatus, note?: string): ItemDto {
    const now = this.now()
    this.db.transaction((tx) => {
      const current = tx.select().from(items).where(eq(items.id, id)).get()
      if (!current) throw new NotFoundError('Elemento')
      if (current.status === status) return
      tx.update(items)
        .set({ status, completedAt: completedAtFor(current, status, now), updatedAt: now })
        .where(eq(items.id, id))
        .run()
      tx.insert(activityLogs)
        .values({
          id: this.newId(),
          itemId: id,
          fromStatus: current.status,
          toStatus: status,
          at: now,
          note: note ?? null
        })
        .run()
    })
    return this.requireDetail(id).item
  }

  /** Omite una ocurrencia concreta de una serie, guardándola como excepción. */
  skipOccurrence(id: string, originalStart: number): boolean {
    const detail = this.get(id)
    if (!detail?.recurrence || detail.item.startAt === null) return false
    const rec = detail.recurrence
    const isOccurrence = expandOccurrences({
      rrule: rec.rrule,
      timezone: rec.timezone,
      startAt: detail.item.startAt,
      exceptions: [],
      from: originalStart,
      to: originalStart
    }).includes(originalStart)
    if (!isOccurrence) return false
    if (rec.exceptions.includes(originalStart)) return true
    this.db
      .update(recurrences)
      .set({ exceptions: [...rec.exceptions, originalStart].sort((a, b) => a - b) })
      .where(eq(recurrences.itemId, id))
      .run()
    return true
  }

  /** Apariciones (únicas y de series) cuyo intervalo toca [from, to]. */
  listRange(from: number, to: number): OccurrenceDto[] {
    const result: OccurrenceDto[] = []

    const singles = this.db
      .select()
      .from(items)
      .leftJoin(recurrences, eq(recurrences.itemId, items.id))
      .where(and(isNull(recurrences.id), isNotNull(items.startAt), lte(items.startAt, to)))
      .all()
    for (const { items: row } of singles) {
      const start = row.startAt as number
      const end = row.endAt ?? start
      if (end < from) continue
      result.push(toOccurrence(row, start, row.endAt, start, false))
    }

    const series = this.db
      .select()
      .from(items)
      .innerJoin(recurrences, eq(recurrences.itemId, items.id))
      .where(and(isNotNull(items.startAt), lte(items.startAt, to)))
      .all()
    for (const { items: row, recurrences: rec } of series) {
      const start = row.startAt as number
      const duration = row.endAt !== null ? row.endAt - start : 0
      const starts = expandOccurrences({
        rrule: rec.rrule,
        timezone: rec.timezone,
        startAt: start,
        exceptions: rec.exceptions,
        from: from - duration,
        to
      })
      for (const s of starts) {
        result.push(toOccurrence(row, s, row.endAt !== null ? s + duration : null, s, true))
      }
    }

    return result.sort((a, b) => a.startAt - b.startAt || a.title.localeCompare(b.title, 'es'))
  }

  /** Ítems sin hora de inicio (p. ej. tareas con solo fecha límite). */
  listUnscheduled(): ItemDto[] {
    return this.db
      .select()
      .from(items)
      .where(and(isNull(items.startAt), or(eq(items.kind, 'task'), eq(items.kind, 'habit'))))
      .orderBy(asc(items.priority), asc(items.dueAt))
      .all()
      .map(toItemDto)
  }

  private getReminders(itemId: string): ReminderDto[] {
    return this.db
      .select()
      .from(reminders)
      .where(eq(reminders.itemId, itemId))
      .orderBy(desc(reminders.offsetMinutes), asc(reminders.id))
      .all()
      .map((r) => ({
        id: r.id,
        offsetMinutes: r.offsetMinutes,
        snoozeMinutes: r.snoozePolicy.minutes,
        maxSnoozes: r.snoozePolicy.maxSnoozes
      }))
  }

  private insertReminder(tx: Tx, itemId: string, r: ReminderInput): void {
    tx.insert(reminders)
      .values({
        id: this.newId(),
        itemId,
        offsetMinutes: r.offsetMinutes,
        snoozePolicy: { minutes: r.snoozeMinutes, maxSnoozes: r.maxSnoozes }
      })
      .run()
  }

  /** Sustituye los recordatorios reutilizando filas por posición para conservar sus IDs (y su historial). */
  private replaceReminders(tx: Tx, itemId: string, next: ReminderInput[]): void {
    const sorted = [...next].sort((a, b) => b.offsetMinutes - a.offsetMinutes)
    const current = tx
      .select()
      .from(reminders)
      .where(eq(reminders.itemId, itemId))
      .orderBy(desc(reminders.offsetMinutes), asc(reminders.id))
      .all()
    sorted.forEach((r, i) => {
      const row = current[i]
      if (!row) return this.insertReminder(tx, itemId, r)
      tx.update(reminders)
        .set({
          offsetMinutes: r.offsetMinutes,
          snoozePolicy: { minutes: r.snoozeMinutes, maxSnoozes: r.maxSnoozes }
        })
        .where(eq(reminders.id, row.id))
        .run()
    })
    for (const extra of current.slice(sorted.length)) {
      tx.delete(reminders).where(eq(reminders.id, extra.id)).run()
    }
  }

  private getRecurrence(itemId: string): RecurrenceDto | null {
    const r = this.db.select().from(recurrences).where(eq(recurrences.itemId, itemId)).get()
    return r ? { rrule: r.rrule, timezone: r.timezone, exceptions: r.exceptions } : null
  }

  private requireDetail(id: string): ItemDetailDto {
    const d = this.get(id)
    if (!d) throw new NotFoundError('Elemento')
    return d
  }
}

function completedAtFor(current: ItemRow, next: ItemStatus, now: number): number | null {
  if (next !== 'done') return null
  return current.status === 'done' ? current.completedAt : now
}

function toItemDto(row: ItemRow): ItemDto {
  return { ...row }
}

function toOccurrence(
  row: ItemRow,
  startAt: number,
  endAt: number | null,
  originalStart: number,
  recurring: boolean
): OccurrenceDto {
  return {
    key: `${row.id}:${originalStart}`,
    itemId: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    category: row.category,
    allDay: row.allDay,
    startAt,
    endAt,
    originalStart,
    recurring
  }
}
