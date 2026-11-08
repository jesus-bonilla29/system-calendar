import { describe, expect, it } from 'vitest'
import { layoutSegments } from './layout'

describe('layoutSegments', () => {
  it('eventos que no se solapan ocupan una sola columna', () => {
    const r = layoutSegments([
      { key: 'a', start: 60, end: 120 },
      { key: 'b', start: 120, end: 180 }
    ])
    expect(r.every((p) => p.col === 0 && p.cols === 1)).toBe(true)
  })

  it('eventos solapados se reparten en columnas', () => {
    const r = layoutSegments([
      { key: 'a', start: 60, end: 180 },
      { key: 'b', start: 90, end: 150 },
      { key: 'c', start: 200, end: 230 }
    ])
    const by = Object.fromEntries(r.map((p) => [p.key, p]))
    expect(by.a).toMatchObject({ col: 0, cols: 2 })
    expect(by.b).toMatchObject({ col: 1, cols: 2 })
    expect(by.c).toMatchObject({ col: 0, cols: 1 })
  })

  it('reutiliza una columna libre dentro del mismo grupo', () => {
    const r = layoutSegments([
      { key: 'a', start: 0, end: 100 },
      { key: 'b', start: 10, end: 50 },
      { key: 'c', start: 60, end: 90 }
    ])
    const by = Object.fromEntries(r.map((p) => [p.key, p]))
    expect(by.c.col).toBe(1)
    expect(by.a.cols).toBe(2)
  })
})
