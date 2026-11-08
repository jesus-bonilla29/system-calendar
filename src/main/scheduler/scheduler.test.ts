import { join } from 'node:path'
import { TZDate } from '@date-fns/tz'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDb } from '../db'
import { scheduledTriggers } from '../db/schema'
import type { ItemInput, ReminderInput } from '../../shared/domain'
import { AgendaService } from '../services/agenda'
import { isQuietAt } from '../services/settings'
import { Scheduler, type TriggerView } from './scheduler'

const tz = 'America/Bogota'
const MIN = 60_000
const at = (d: number, h = 10, m = 0, zone = tz, mo = 11): number =>
  new TZDate(2026, mo - 1, d, h, m, 0, zone).getTime()

const base: ItemInput = {
  kind: 'task',
  title: 'Estudiar',
  notes: '',
  startAt: null,
  endAt: null,
  allDay: false,
  estimatedMinutes: null,
  dueAt: null,
  priority: 3,
  category: null,
  status: 'pending',
  flexibility: 'rigid'
}
const rem = (offsetMinutes: number, maxSnoozes = 3, snoozeMinutes = 10): ReminderInput => ({
  offsetMinutes,
  snoozeMinutes,
  maxSnoozes
})

let db: AppDb
let agenda: AgendaService
let clock: number
let fired: TriggerView[]
let quiet: (t: number) => boolean
let n: number

const makeScheduler = (database: AppDb = db): Scheduler =>
  new Scheduler({
    db: database,
    notifier: { notify: (t) => fired.push(t) },
    now: () => clock,
    newId: () => `t${++n}`,
    isQuiet: (t) => quiet(t)
  })

const rowOf = (id: string) =>
  db.select().from(scheduledTriggers).where(eq(scheduledTriggers.id, id)).get()

beforeEach(() => {
  db = openDatabase(':memory:', join(process.cwd(), 'drizzle')).db
  agenda = new AgendaService(db)
  clock = at(8, 8)
  fired = []
  quiet = () => false
  n = 0
})

describe('disparo normal', () => {
  it('avisa X minutos antes y solo una vez', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    const s = makeScheduler()
    s.recover()

    clock = at(8, 9, 49)
    s.tick()
    expect(fired).toHaveLength(0)

    clock = at(8, 9, 50)
    s.tick()
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ title: 'Estudiar', offsetMinutes: 10, canSnooze: true })

    clock = at(8, 9, 51)
    s.tick()
    expect(fired).toHaveLength(1)
  })

  it('varios recordatorios por ítem', () => {
    agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(60), rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 0)
    s.tick()
    clock = at(8, 9, 50)
    s.tick()
    expect(fired.map((f) => f.offsetMinutes)).toEqual([60, 10])
  })

  it('un ítem sin recordatorios no genera disparos', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null })
    const s = makeScheduler()
    s.recover()
    expect(db.select().from(scheduledTriggers).all()).toHaveLength(0)
  })

  it('con retraso dentro de la tolerancia avisa; pasada la tolerancia lo da por perdido', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 51) // 1 min tarde
    s.tick()
    expect(fired).toHaveLength(1)

    agenda.create({
      item: { ...base, title: 'Otra', startAt: at(8, 12) },
      recurrence: null,
      reminders: [rem(10)]
    })
    s.sync()
    clock = at(8, 11, 55) // 5 min tarde (tolerancia: 2)
    s.tick()
    expect(fired).toHaveLength(1)
    expect(s.listMissed().map((m) => m.title)).toEqual(['Otra'])
  })
})

describe('posponer y resolver', () => {
  it('pospone según la política y respeta el máximo', () => {
    agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10, 1, 5)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 50)
    s.tick()
    const id = fired[0].id

    expect(s.snooze(id)).toBe(at(8, 9, 55))
    clock = at(8, 9, 54)
    s.tick()
    expect(fired).toHaveLength(1)
    clock = at(8, 9, 55)
    s.tick()
    expect(fired).toHaveLength(2)
    expect(fired[1]).toMatchObject({ snoozeCount: 1, canSnooze: false })
    expect(s.snooze(id)).toBeNull()
  })

  it('un aviso pospuesto sigue vivo tras re-sincronizar', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 50)
    s.tick()
    s.snooze(fired[0].id)
    s.sync()
    expect(rowOf(fired[0].id)).toMatchObject({ status: 'pending', fireAt: at(8, 10, 0) })
  })

  it('resolve marca iniciado/descartado y devuelve el ítem', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 50)
    s.tick()
    expect(s.resolve(fired[0].id, 'started')).toBe(c.item.id)
    expect(rowOf(fired[0].id)?.status).toBe('started')
    expect(s.resolve('nope', 'dismissed')).toBeNull()
  })
})

describe('persistencia y recuperación', () => {
  it('tras reiniciar la app recupera lo que venció mientras estuvo cerrada', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    agenda.create({
      item: { ...base, title: 'Tarde', startAt: at(8, 20) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const first = makeScheduler()
    first.recover()
    clock = at(8, 8, 30)
    first.tick() // último latido a las 08:30

    // La app se cierra y vuelve a abrirse a las 15:00 (instancia nueva, misma base).
    clock = at(8, 15, 0)
    const second = makeScheduler()
    const missed = second.start()
    second.stop()
    expect(missed.map((m) => m.title)).toEqual(['Estudiar'])
    expect(fired).toHaveLength(0)

    // El pendiente de la noche sigue en pie.
    clock = at(8, 19, 50)
    second.tick()
    expect(fired.map((f) => f.title)).toEqual(['Tarde'])
  })

  it('la primera vez que arranca no inventa avisos perdidos', () => {
    agenda.create({ item: { ...base, startAt: at(7, 10) }, recurrence: null, reminders: [rem(10)] })
    const s = makeScheduler()
    s.recover()
    expect(s.listMissed()).toHaveLength(0)
  })

  it('acknowledgeMissed limpia el resumen', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 0)
    s.tick()
    clock = at(8, 15, 0)
    s.recover()
    expect(s.listMissed()).toHaveLength(1)
    s.acknowledgeMissed()
    expect(s.listMissed()).toHaveLength(0)
  })
})

describe('suspensión y cambios de hora', () => {
  it('detecta una suspensión (salto adelante) y marca lo vencido como perdido', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    agenda.create({
      item: { ...base, title: 'Noche', startAt: at(8, 21) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 0)
    s.tick()

    clock = at(8, 14, 0) // el equipo durmió 5 horas; el siguiente tick llega tarde
    s.tick()
    expect(fired).toHaveLength(0)
    expect(s.listMissed().map((m) => m.title)).toEqual(['Estudiar'])

    clock = at(8, 20, 50)
    s.tick()
    expect(fired.map((f) => f.title)).toEqual(['Noche'])
  })

  it('el reloj atrás no repite avisos ya dados y los futuros siguen disparando a su hora', () => {
    agenda.create({ item: { ...base, startAt: at(8, 10) }, recurrence: null, reminders: [rem(10)] })
    agenda.create({
      item: { ...base, title: 'Después', startAt: at(8, 12) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 50)
    s.tick()
    expect(fired).toHaveLength(1)

    clock = at(8, 8, 0) // el reloj retrocede 1 h 50 min
    s.tick()
    clock = at(8, 9, 55)
    s.tick()
    expect(fired).toHaveLength(1) // no se repite

    clock = at(8, 11, 50)
    s.tick()
    expect(fired.map((f) => f.title)).toEqual(['Estudiar', 'Después'])
  })
})

describe('series', () => {
  it('avisa cada día de una serie diaria', () => {
    agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz },
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    for (const d of [8, 9, 10]) {
      clock = at(d, 9, 50)
      s.tick()
    }
    expect(fired.map((f) => f.occurrenceStart)).toEqual([at(8, 10), at(9, 10), at(10, 10)])
  })

  it('una ocurrencia omitida no avisa', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz },
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    agenda.skipOccurrence(c.item.id, at(9, 10))
    s.sync()
    for (const d of [8, 9, 10]) {
      clock = at(d, 9, 50)
      s.tick()
    }
    expect(fired.map((f) => f.occurrenceStart)).toEqual([at(8, 10), at(10, 10)])
  })

  it('mantiene la hora local al cambiar el horario de verano (Madrid, 25-oct-2026)', () => {
    const mad = 'Europe/Madrid'
    clock = at(24, 8, 0, mad, 10)
    agenda.create({
      item: { ...base, startAt: at(24, 10, 0, mad, 10) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: mad },
      reminders: [rem(30)]
    })
    const s = makeScheduler()
    s.recover()
    for (const d of [24, 25, 26]) {
      clock = at(d, 9, 30, mad, 10)
      s.tick()
    }
    expect(fired.map((f) => f.fireAt)).toEqual([
      at(24, 9, 30, mad, 10),
      at(25, 9, 30, mad, 10),
      at(26, 9, 30, mad, 10)
    ])
    // Entre el 24 y el 25 hay 25 horas reales: el aviso "sigue siendo a las 09:30 locales".
    expect(fired[1].fireAt - fired[0].fireAt).toBe(25 * 60 * MIN)
  })
})

describe('ediciones', () => {
  it('completar el ítem cancela sus avisos pendientes', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    agenda.setStatus(c.item.id, 'done')
    s.sync()
    clock = at(8, 9, 50)
    s.tick()
    expect(fired).toHaveLength(0)
    expect(db.select().from(scheduledTriggers).all()).toHaveLength(0)
  })

  it('cambiar la hora de inicio o el desplazamiento reprograma el aviso', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()

    agenda.update(c.item.id, {
      item: { ...base, startAt: at(8, 12) },
      recurrence: null,
      reminders: [rem(10)]
    })
    s.sync()
    expect(
      db
        .select()
        .from(scheduledTriggers)
        .all()
        .map((t) => t.fireAt)
    ).toEqual([at(8, 11, 50)])

    agenda.update(c.item.id, {
      item: { ...base, startAt: at(8, 12) },
      recurrence: null,
      reminders: [rem(30)]
    })
    s.sync()
    const rows = db.select().from(scheduledTriggers).all()
    expect(rows.map((t) => t.fireAt)).toEqual([at(8, 11, 30)])
  })

  it('quitar los recordatorios elimina los avisos pendientes', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    agenda.update(c.item.id, { item: { ...base, startAt: at(8, 10) }, recurrence: null })
    s.sync()
    expect(db.select().from(scheduledTriggers).all()).toHaveLength(0)
  })

  it('editar un ítem conserva el historial de avisos ya dados', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 9, 50)
    s.tick()
    agenda.update(c.item.id, {
      item: { ...base, title: 'Renombrado', startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    s.sync()
    const rows = db.select().from(scheduledTriggers).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('fired')
  })

  it('borrar el ítem borra sus avisos', () => {
    const c = agenda.create({
      item: { ...base, startAt: at(8, 10) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    agenda.delete(c.item.id)
    expect(db.select().from(scheduledTriggers).all()).toHaveLength(0)
  })
})

describe('horas de silencio', () => {
  it('no avisa en silencio, pero queda en el resumen', () => {
    quiet = (t) => isQuietAt({ enabled: true, start: '23:00', end: '07:00' }, t)
    clock = at(8, 21, 0)
    agenda.create({
      item: { ...base, startAt: at(8, 23, 30) },
      recurrence: null,
      reminders: [rem(10)]
    })
    const s = makeScheduler()
    s.recover()
    clock = at(8, 23, 20)
    s.tick()
    expect(fired).toHaveLength(0)
    expect(s.listMissed()).toMatchObject([{ title: 'Estudiar', status: 'silenced' }])
  })

  it('isQuietAt cruza la medianoche y respeta "desactivado"', () => {
    const cfg = { enabled: true, start: '23:00', end: '07:00' }
    expect(isQuietAt(cfg, at(8, 23, 30))).toBe(true)
    expect(isQuietAt(cfg, at(8, 3, 0))).toBe(true)
    expect(isQuietAt(cfg, at(8, 7, 0))).toBe(false)
    expect(isQuietAt(cfg, at(8, 12, 0))).toBe(false)
    expect(isQuietAt({ ...cfg, enabled: false }, at(8, 3, 0))).toBe(false)
  })
})
