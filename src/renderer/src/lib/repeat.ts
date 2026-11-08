import { RRule } from 'rrule'

export type RepeatFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type RepeatEnd = 'never' | 'count' | 'until'

/** Configuración simple de repetición que edita el formulario. weekdays: 0 = lunes … 6 = domingo. */
export interface RepeatConfig {
  freq: RepeatFreq
  interval: number
  weekdays: number[]
  end: RepeatEnd
  count: number
  /** yyyy-MM-dd (día local, inclusive) */
  until: string
}

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

export const defaultRepeat = (): RepeatConfig => ({
  freq: 'DAILY',
  interval: 1,
  weekdays: [],
  end: 'never',
  count: 10,
  until: ''
})

export function buildRRule(cfg: RepeatConfig): string {
  const parts = [`FREQ=${cfg.freq}`]
  if (cfg.interval > 1) parts.push(`INTERVAL=${cfg.interval}`)
  if (cfg.freq === 'WEEKLY' && cfg.weekdays.length > 0) {
    const days = [...cfg.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_CODES[d])
    parts.push(`BYDAY=${days.join(',')}`)
  }
  if (cfg.end === 'count') parts.push(`COUNT=${Math.max(1, cfg.count)}`)
  if (cfg.end === 'until' && cfg.until) parts.push(`UNTIL=${cfg.until.replaceAll('-', '')}T235959Z`)
  return parts.join(';')
}

/** Devuelve la configuración si la regla es representable con el formulario simple; si no, null. */
export function parseRRule(rule: string): RepeatConfig | null {
  let o
  try {
    o = RRule.parseString(rule.replace(/^RRULE:/i, ''))
  } catch {
    return null
  }
  const allowed = new Set(['freq', 'interval', 'byweekday', 'count', 'until'])
  if (Object.keys(o).some((k) => !allowed.has(k))) return null
  const freqs: Record<number, RepeatFreq> = {
    [RRule.DAILY]: 'DAILY',
    [RRule.WEEKLY]: 'WEEKLY',
    [RRule.MONTHLY]: 'MONTHLY',
    [RRule.YEARLY]: 'YEARLY'
  }
  const freq = o.freq === undefined ? undefined : freqs[o.freq]
  if (!freq) return null
  if (o.count !== undefined && o.until) return null

  let weekdays: number[] = []
  if (o.byweekday !== undefined && o.byweekday !== null) {
    if (freq !== 'WEEKLY') return null
    const list = Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday]
    for (const w of list) {
      if (typeof w === 'object' && 'n' in w && w.n) return null
      weekdays.push(
        typeof w === 'number' ? w : typeof w === 'string' ? WEEKDAY_CODES.indexOf(w) : w.weekday
      )
    }
    weekdays = [...new Set(weekdays)].sort((a, b) => a - b)
  }

  const cfg: RepeatConfig = { ...defaultRepeat(), freq, interval: o.interval ?? 1, weekdays }
  if (o.count !== undefined && o.count !== null) {
    cfg.end = 'count'
    cfg.count = o.count
  } else if (o.until) {
    cfg.end = 'until'
    const u = o.until
    cfg.until = `${u.getUTCFullYear()}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`
  }
  return cfg
}
