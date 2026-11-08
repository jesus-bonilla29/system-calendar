import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { es } from 'date-fns/locale'

export type ViewKind = 'day' | 'week' | 'month'

/** La semana empieza en lunes. */
export const WEEK_OPTS = { weekStartsOn: 1 as const, locale: es }

export const systemTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

export function visibleRange(view: ViewKind, cursor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: startOfDay(cursor), to: endOfDay(cursor) }
  if (view === 'week') {
    return { from: startOfWeek(cursor, WEEK_OPTS), to: endOfWeek(cursor, WEEK_OPTS) }
  }
  return {
    from: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
    to: endOfWeek(endOfMonth(cursor), WEEK_OPTS)
  }
}

export function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = []
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) days.push(d)
  return days
}

export function shiftCursor(view: ViewKind, cursor: Date, dir: 1 | -1): Date {
  if (view === 'day') return addDays(cursor, dir)
  if (view === 'week') return addWeeks(cursor, dir)
  return addMonths(cursor, dir)
}

export function titleFor(view: ViewKind, cursor: Date): string {
  if (view === 'day') return format(cursor, "EEEE d 'de' MMMM yyyy", { locale: es })
  if (view === 'month') return format(cursor, 'MMMM yyyy', { locale: es })
  const { from, to } = visibleRange('week', cursor)
  const sameMonth = from.getMonth() === to.getMonth()
  return sameMonth
    ? `${format(from, 'd', { locale: es })} – ${format(to, "d 'de' MMMM yyyy", { locale: es })}`
    : `${format(from, "d 'de' MMM", { locale: es })} – ${format(to, "d 'de' MMM yyyy", { locale: es })}`
}

export const timeLabel = (ms: number): string => format(ms, 'HH:mm')

/** Valores para <input type="date"> / <input type="time"> en hora local. */
export const toDateInput = (ms: number): string => format(ms, 'yyyy-MM-dd')
export const toTimeInput = (ms: number): string => format(ms, 'HH:mm')

/** Combina fecha (yyyy-MM-dd) y hora (HH:mm) locales en milisegundos; null si falta la fecha. */
export function fromInputs(date: string, time: string): number | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}
