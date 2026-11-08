import { RRule, rrulestr } from 'rrule'
import { TZDate } from '@date-fns/tz'

/**
 * Expansión de recurrencias.
 *
 * rrule trabaja con fechas "flotantes": se le pasa la hora local de pared codificada como UTC
 * y devuelve horas de pared. Después cada ocurrencia se convierte a instante real en la zona
 * IANA de la regla; así "las 10:00" sigue siendo las 10:00 aunque cambie el horario de verano.
 */

export interface ExpandInput {
  rrule: string
  timezone: string
  /** Inicio de la primera ocurrencia (ms UTC). */
  startAt: number
  exceptions: number[]
  /** Rango a consultar (ms UTC), ambos inclusivos sobre el inicio de la ocurrencia. */
  from: number
  to: number
}

/** Hora de pared de un instante en una zona, codificada como UTC. */
function wallAsUtc(instant: number, timezone: string): number {
  const d = new TZDate(instant, timezone)
  return Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds()
  )
}

/** Inversa: hora de pared (codificada como UTC) → instante real en la zona. */
function wallToInstant(wall: number, timezone: string): number {
  const w = new Date(wall)
  return new TZDate(
    w.getUTCFullYear(),
    w.getUTCMonth(),
    w.getUTCDate(),
    w.getUTCHours(),
    w.getUTCMinutes(),
    w.getUTCSeconds(),
    timezone
  ).getTime()
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** Valida una línea RRULE (sin DTSTART). Devuelve null si es válida o el motivo del fallo. */
export function validateRRule(rule: string): string | null {
  if (!/^(RRULE:)?[A-Z0-9=;,+\-:]+$/i.test(rule) || rule.length > 500) return 'Regla no válida'
  try {
    const o = RRule.parseString(rule.replace(/^RRULE:/i, ''))
    if (o.freq === undefined) return 'Falta la frecuencia (FREQ)'
    if (o.freq === RRule.SECONDLY || o.freq === RRule.MINUTELY) return 'Frecuencia no soportada'
    return null
  } catch {
    return 'Regla no válida'
  }
}

/** Instantes (ms UTC) de inicio de cada ocurrencia dentro del rango, sin las excepciones. */
export function expandOccurrences(input: ExpandInput): number[] {
  const { rrule, timezone, startAt, exceptions, from, to } = input
  const rule = rrulestr(rrule.replace(/^RRULE:/i, ''), {
    dtstart: new Date(wallAsUtc(startAt, timezone))
  })
  // Margen de un día a cada lado: la conversión pared↔instante puede desplazar hasta ~14 h.
  const DAY = 86_400_000
  const wallFrom = new Date(wallAsUtc(from, timezone) - DAY)
  const wallTo = new Date(wallAsUtc(to, timezone) + DAY)
  const skip = new Set(exceptions)
  const result: number[] = []
  for (const wall of rule.between(wallFrom, wallTo, true)) {
    const instant = wallToInstant(wall.getTime(), timezone)
    if (instant < from || instant > to || skip.has(instant)) continue
    result.push(instant)
  }
  return result.sort((a, b) => a - b)
}
