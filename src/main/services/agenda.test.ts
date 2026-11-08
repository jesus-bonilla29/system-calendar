import { join } from 'node:path'
import { TZDate } from '@date-fns/tz'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDb } from '../db'
import { activityLogs } from '../db/schema'
import { itemWithRecurrenceInputSchema, type ItemInput } from '../../shared/domain'
import { AgendaService, NotFoundError } from './agenda'

const tz = 'America/Bogota'
const at = (d: number, h = 10, mo = 11): number =>
  new TZDate(2026, mo - 1, d, h, 0, 0, tz).getTime()

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

let db: AppDb
let svc: AgendaService
let clock: number
let n: number

beforeEach(() => {
  db = openDatabase(':memory:', join(process.cwd(), 'drizzle')).db
  clock = at(1)
  n = 0
  svc = new AgendaService(
    db,
    () => clock,
    () => `id${++n}`
  )
})

describe('CRUD', () => {
  it('crea, lee, actualiza y borra', () => {
    const created = svc.create({ item: { ...base, startAt: at(2) }, recurrence: null })
    expect(svc.get(created.item.id)?.item.title).toBe('Estudiar')

    const updated = svc.update(created.item.id, {
      item: { ...base, title: 'Repasar', startAt: at(3), priority: 1 },
      recurrence: null
    })
    expect(updated.item).toMatchObject({ title: 'Repasar', priority: 1 })

    expect(svc.delete(created.item.id)).toBe(true)
    expect(svc.get(created.item.id)).toBeNull()
    expect(svc.delete(created.item.id)).toBe(false)
  })

  it('actualizar un elemento inexistente lanza NotFoundError', () => {
    expect(() => svc.update('nope', { item: base, recurrence: null })).toThrow(NotFoundError)
  })

  it('borrar un ítem borra su recurrencia (cascada)', () => {
    const c = svc.create({
      item: { ...base, startAt: at(2) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz }
    })
    svc.delete(c.item.id)
    expect(svc.listRange(at(1, 0), at(30, 23))).toHaveLength(0)
  })
})

describe('estado e historial', () => {
  it('registra cambios de estado y completedAt', () => {
    const c = svc.create({ item: base, recurrence: null })
    clock = at(5)
    const done = svc.setStatus(c.item.id, 'done', 'listo')
    expect(done.status).toBe('done')
    expect(done.completedAt).toBe(at(5))
    const logs = db.select().from(activityLogs).where(eq(activityLogs.itemId, c.item.id)).all()
    expect(logs.map((l) => l.toStatus)).toEqual(['pending', 'done'])
    expect(logs[1].fromStatus).toBe('pending')

    const reopened = svc.setStatus(c.item.id, 'pending')
    expect(reopened.completedAt).toBeNull()
  })

  it('no registra nada si el estado no cambia', () => {
    const c = svc.create({ item: base, recurrence: null })
    svc.setStatus(c.item.id, 'pending')
    expect(db.select().from(activityLogs).all()).toHaveLength(1)
  })

  it('update con cambio de estado también queda en el historial', () => {
    const c = svc.create({ item: base, recurrence: null })
    svc.update(c.item.id, { item: { ...base, status: 'in_progress' }, recurrence: null })
    const logs = db.select().from(activityLogs).all()
    expect(logs.map((l) => l.toStatus)).toEqual(['pending', 'in_progress'])
  })
})

describe('listRange', () => {
  it('devuelve ítems únicos que tocan el rango y excluye los demás', () => {
    svc.create({ item: { ...base, title: 'dentro', startAt: at(3) }, recurrence: null })
    svc.create({ item: { ...base, title: 'antes', startAt: at(1) }, recurrence: null })
    svc.create({ item: { ...base, title: 'despues', startAt: at(20) }, recurrence: null })
    svc.create({ item: { ...base, title: 'sin fecha' }, recurrence: null })
    const r = svc.listRange(at(2, 0), at(5, 23))
    expect(r.map((o) => o.title)).toEqual(['dentro'])
  })

  it('incluye un evento que empezó antes pero termina dentro del rango', () => {
    svc.create({
      item: { ...base, kind: 'event', title: 'largo', startAt: at(1, 22), endAt: at(2, 3) },
      recurrence: null
    })
    expect(svc.listRange(at(2, 0), at(2, 23))).toHaveLength(1)
  })

  it('expande series con duración y omite excepciones', () => {
    const c = svc.create({
      item: { ...base, title: 'Estudiar', startAt: at(2), endAt: at(2, 11) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz }
    })
    let r = svc.listRange(at(2, 0), at(8, 23))
    expect(r).toHaveLength(7)
    expect(r[0]).toMatchObject({ startAt: at(2), endAt: at(2, 11), recurring: true })

    expect(svc.skipOccurrence(c.item.id, at(4))).toBe(true)
    r = svc.listRange(at(2, 0), at(8, 23))
    expect(r).toHaveLength(6)
    expect(r.find((o) => o.startAt === at(4))).toBeUndefined()
  })

  it('omitir es idempotente y rechaza instantes que no son ocurrencia', () => {
    const c = svc.create({
      item: { ...base, startAt: at(2) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz }
    })
    expect(svc.skipOccurrence(c.item.id, at(4))).toBe(true)
    expect(svc.skipOccurrence(c.item.id, at(4))).toBe(true)
    expect(svc.get(c.item.id)?.recurrence?.exceptions).toEqual([at(4)])
    expect(svc.skipOccurrence(c.item.id, at(4, 11))).toBe(false)
    expect(svc.skipOccurrence('nope', at(4))).toBe(false)
  })

  it('editar la serie conserva excepciones si el inicio no cambia y las borra si cambia', () => {
    const rec = { rrule: 'FREQ=DAILY', timezone: tz }
    const c = svc.create({ item: { ...base, startAt: at(2) }, recurrence: rec })
    svc.skipOccurrence(c.item.id, at(4))

    svc.update(c.item.id, { item: { ...base, title: 'Otro', startAt: at(2) }, recurrence: rec })
    expect(svc.get(c.item.id)?.recurrence?.exceptions).toEqual([at(4)])

    svc.update(c.item.id, { item: { ...base, startAt: at(2, 11) }, recurrence: rec })
    expect(svc.get(c.item.id)?.recurrence?.exceptions).toEqual([])
  })

  it('quitar la recurrencia convierte la serie en ítem único', () => {
    const c = svc.create({
      item: { ...base, startAt: at(2) },
      recurrence: { rrule: 'FREQ=DAILY', timezone: tz }
    })
    svc.update(c.item.id, { item: { ...base, startAt: at(2) }, recurrence: null })
    expect(svc.get(c.item.id)?.recurrence).toBeNull()
    expect(svc.listRange(at(1, 0), at(30, 23))).toHaveLength(1)
  })
})

describe('listUnscheduled', () => {
  it('lista tareas sin hora de inicio, ordenadas por prioridad y fecha límite', () => {
    svc.create({ item: { ...base, title: 'baja', priority: 4 }, recurrence: null })
    svc.create({ item: { ...base, title: 'urgente', priority: 1, dueAt: at(9) }, recurrence: null })
    svc.create({ item: { ...base, title: 'con hora', startAt: at(2) }, recurrence: null })
    expect(svc.listUnscheduled().map((i) => i.title)).toEqual(['urgente', 'baja'])
  })
})

describe('validación de entrada', () => {
  const parse = (v: unknown) => itemWithRecurrenceInputSchema.safeParse(v)

  it('acepta una entrada correcta', () => {
    expect(parse({ item: base, recurrence: null }).success).toBe(true)
  })
  it('rechaza título vacío, fin antes del inicio y prioridad fuera de rango', () => {
    expect(parse({ item: { ...base, title: '   ' }, recurrence: null }).success).toBe(false)
    expect(
      parse({ item: { ...base, startAt: at(3), endAt: at(2) }, recurrence: null }).success
    ).toBe(false)
    expect(parse({ item: { ...base, priority: 9 }, recurrence: null }).success).toBe(false)
  })
  it('rechaza fin sin inicio y recurrencia sin inicio', () => {
    expect(parse({ item: { ...base, endAt: at(3) }, recurrence: null }).success).toBe(false)
    expect(parse({ item: base, recurrence: { rrule: 'FREQ=DAILY', timezone: tz } }).success).toBe(
      false
    )
  })
  it('rechaza reglas y zonas horarias inválidas', () => {
    const item = { ...base, startAt: at(2) }
    expect(parse({ item, recurrence: { rrule: 'FREQ=NOPE', timezone: tz } }).success).toBe(false)
    expect(parse({ item, recurrence: { rrule: 'FREQ=DAILY', timezone: 'Marte' } }).success).toBe(
      false
    )
  })
})
