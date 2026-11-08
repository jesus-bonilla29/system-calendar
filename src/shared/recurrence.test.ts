import { describe, expect, it } from 'vitest'
import { TZDate } from '@date-fns/tz'
import { expandOccurrences, isValidTimezone, validateRRule } from './recurrence'

const at = (y: number, m: number, d: number, h: number, mi: number, tz: string): number =>
  new TZDate(y, m - 1, d, h, mi, 0, tz).getTime()

describe('validateRRule / isValidTimezone', () => {
  it('acepta reglas válidas y rechaza inválidas', () => {
    expect(validateRRule('FREQ=DAILY')).toBeNull()
    expect(validateRRule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5')).toBeNull()
    expect(validateRRule('FREQ=BANANA')).not.toBeNull()
    expect(validateRRule('hola mundo')).not.toBeNull()
    expect(validateRRule('FREQ=MINUTELY')).not.toBeNull()
  })
  it('valida zonas horarias', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true)
    expect(isValidTimezone('Marte/Olimpo')).toBe(false)
  })
})

describe('expandOccurrences', () => {
  const tz = 'America/Bogota'

  it('diaria a las 10:00 durante una semana', () => {
    const startAt = at(2026, 11, 2, 10, 0, tz)
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tz,
      startAt,
      exceptions: [],
      from: at(2026, 11, 2, 0, 0, tz),
      to: at(2026, 11, 8, 23, 59, tz)
    })
    expect(r).toHaveLength(7)
    expect(r[0]).toBe(startAt)
    expect(r[6]).toBe(at(2026, 11, 8, 10, 0, tz))
  })

  it('semanal en lunes y miércoles', () => {
    const r = expandOccurrences({
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
      timezone: tz,
      startAt: at(2026, 11, 2, 18, 30, tz),
      exceptions: [],
      from: at(2026, 11, 1, 0, 0, tz),
      to: at(2026, 11, 15, 23, 59, tz)
    })
    expect(r).toEqual([
      at(2026, 11, 2, 18, 30, tz),
      at(2026, 11, 4, 18, 30, tz),
      at(2026, 11, 9, 18, 30, tz),
      at(2026, 11, 11, 18, 30, tz)
    ])
  })

  it('respeta las excepciones', () => {
    const skipped = at(2026, 11, 4, 10, 0, tz)
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tz,
      startAt: at(2026, 11, 2, 10, 0, tz),
      exceptions: [skipped],
      from: at(2026, 11, 2, 0, 0, tz),
      to: at(2026, 11, 5, 23, 59, tz)
    })
    expect(r).not.toContain(skipped)
    expect(r).toHaveLength(3)
  })

  it('respeta COUNT y UNTIL', () => {
    const base = {
      timezone: tz,
      startAt: at(2026, 11, 2, 10, 0, tz),
      exceptions: [],
      from: at(2026, 11, 1, 0, 0, tz),
      to: at(2027, 1, 1, 0, 0, tz)
    }
    expect(expandOccurrences({ ...base, rrule: 'FREQ=DAILY;COUNT=3' })).toHaveLength(3)
    expect(expandOccurrences({ ...base, rrule: 'FREQ=DAILY;UNTIL=20261104T235959Z' })).toHaveLength(
      3
    )
  })

  it('mantiene las 10:00 locales al cambiar el horario (Madrid, 25-oct-2026)', () => {
    const tzm = 'Europe/Madrid'
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tzm,
      startAt: at(2026, 10, 23, 10, 0, tzm),
      exceptions: [],
      from: at(2026, 10, 23, 0, 0, tzm),
      to: at(2026, 10, 28, 23, 59, tzm)
    })
    expect(r).toEqual([23, 24, 25, 26, 27, 28].map((d) => at(2026, 10, d, 10, 0, tzm)))
    // Antes del cambio son 08:00 UTC; después, 09:00 UTC.
    expect(new Date(r[0]).getUTCHours()).toBe(8)
    expect(new Date(r[5]).getUTCHours()).toBe(9)
  })

  it('mantiene la hora local en el cambio de primavera de Nueva York (8-mar-2026)', () => {
    const tzn = 'America/New_York'
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tzn,
      startAt: at(2026, 3, 6, 9, 0, tzn),
      exceptions: [],
      from: at(2026, 3, 6, 0, 0, tzn),
      to: at(2026, 3, 10, 23, 59, tzn)
    })
    expect(r).toEqual([6, 7, 8, 9, 10].map((d) => at(2026, 3, d, 9, 0, tzn)))
  })

  it('una hora inexistente (hueco del cambio) no hace saltar el día', () => {
    const tzn = 'America/New_York'
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tzn,
      startAt: at(2026, 3, 7, 2, 30, tzn),
      exceptions: [],
      from: at(2026, 3, 7, 0, 0, tzn),
      to: at(2026, 3, 9, 23, 59, tzn)
    })
    expect(r).toHaveLength(3)
  })

  it('solo devuelve ocurrencias dentro del rango', () => {
    const r = expandOccurrences({
      rrule: 'FREQ=DAILY',
      timezone: tz,
      startAt: at(2026, 1, 1, 10, 0, tz),
      exceptions: [],
      from: at(2026, 11, 3, 0, 0, tz),
      to: at(2026, 11, 3, 23, 59, tz)
    })
    expect(r).toEqual([at(2026, 11, 3, 10, 0, tz)])
  })
})
