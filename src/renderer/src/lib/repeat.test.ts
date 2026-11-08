import { describe, expect, it } from 'vitest'
import { buildRRule, defaultRepeat, parseRRule } from './repeat'

describe('buildRRule', () => {
  it('diaria simple', () => {
    expect(buildRRule(defaultRepeat())).toBe('FREQ=DAILY')
  })
  it('semanal con días, intervalo y fin por repeticiones', () => {
    const r = buildRRule({
      ...defaultRepeat(),
      freq: 'WEEKLY',
      interval: 2,
      weekdays: [2, 0],
      end: 'count',
      count: 5
    })
    expect(r).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5')
  })
  it('fin en una fecha', () => {
    const r = buildRRule({ ...defaultRepeat(), end: 'until', until: '2026-12-31' })
    expect(r).toBe('FREQ=DAILY;UNTIL=20261231T235959Z')
  })
})

describe('parseRRule', () => {
  it('es la inversa de buildRRule', () => {
    const cfgs = [
      defaultRepeat(),
      { ...defaultRepeat(), freq: 'WEEKLY' as const, weekdays: [0, 2, 4] },
      {
        ...defaultRepeat(),
        freq: 'MONTHLY' as const,
        interval: 3,
        end: 'count' as const,
        count: 4
      },
      { ...defaultRepeat(), freq: 'YEARLY' as const, end: 'until' as const, until: '2030-01-15' }
    ]
    for (const c of cfgs) expect(parseRRule(buildRRule(c))).toEqual(c)
  })
  it('devuelve null para reglas que el formulario simple no puede representar', () => {
    expect(parseRRule('FREQ=MONTHLY;BYDAY=1MO')).toBeNull()
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toBeNull()
    expect(parseRRule('FREQ=HOURLY')).toBeNull()
    expect(parseRRule('basura')).toBeNull()
  })
})
