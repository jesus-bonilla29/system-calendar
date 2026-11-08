import { useEffect, useState } from 'react'
import { endOfDay, format, isToday, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { OccurrenceDto } from '@shared/domain'
import { layoutSegments } from '../lib/layout'
import { Chip } from './Chip'

const HOUR_PX = 48
const MIN_MINUTES = 30

interface Props {
  days: Date[]
  occurrences: OccurrenceDto[]
  onOpen: (occ: OccurrenceDto) => void
  onCreate: (startAt: number) => void
}

const overlaps = (o: OccurrenceDto, from: number, to: number): boolean =>
  o.startAt <= to && (o.endAt ?? o.startAt) >= from

/** Rejilla de horas para una o varias columnas (vista día y vista semana). */
export function TimeGrid({ days, occurrences, onOpen, onCreate }: Props): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const template = `56px repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div className="timegrid" style={{ gridTemplateColumns: template }}>
      <div className="head" />
      {days.map((d) => (
        <div key={d.toISOString()} className={`head${isToday(d) ? ' today' : ''}`}>
          {format(d, days.length === 1 ? "EEEE d 'de' MMMM" : 'EEE d', { locale: es })}
        </div>
      ))}

      <div className="allday" />
      {days.map((d) => {
        const from = startOfDay(d).getTime()
        const to = endOfDay(d).getTime()
        const list = occurrences.filter((o) => o.allDay && overlaps(o, from, to))
        return (
          <div key={d.toISOString()} className="allday">
            {list.map((o) => (
              <Chip key={o.key} occ={o} onOpen={onOpen} />
            ))}
          </div>
        )
      })}

      <div className="hours" style={{ height: 24 * HOUR_PX }}>
        {Array.from({ length: 23 }, (_, i) => (
          <span key={i} className="hour-label" style={{ top: (i + 1) * HOUR_PX }}>
            {String(i + 1).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      {days.map((d) => {
        const dayStart = startOfDay(d).getTime()
        const dayEnd = endOfDay(d).getTime()
        const timed = occurrences.filter((o) => !o.allDay && overlaps(o, dayStart, dayEnd))
        const segments = timed.map((o) => {
          const start = (Math.max(o.startAt, dayStart) - dayStart) / 60_000
          const end = (Math.min(o.endAt ?? o.startAt, dayEnd) - dayStart) / 60_000
          return { key: o.key, start, end: Math.max(end, start + MIN_MINUTES) }
        })
        const placed = new Map(layoutSegments(segments).map((p) => [p.key, p]))
        const today = isToday(d)

        return (
          <div
            key={d.toISOString()}
            className={`col${today ? ' today' : ''}`}
            style={{ height: 24 * HOUR_PX }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const minutes = Math.floor((e.clientY - rect.top) / HOUR_PX / 0.5) * 30
              onCreate(dayStart + minutes * 60_000)
            }}
          >
            {timed.map((o) => {
              const p = placed.get(o.key)
              if (!p) return null
              const width = 100 / p.cols
              return (
                <Chip
                  key={o.key}
                  occ={o}
                  onOpen={onOpen}
                  timed
                  style={{
                    top: (p.start / 60) * HOUR_PX,
                    height: ((p.end - p.start) / 60) * HOUR_PX - 2,
                    left: `${p.col * width}%`,
                    width: `calc(${width}% - 2px)`
                  }}
                />
              )
            })}
            {today && (
              <div
                className="now-line"
                style={{ top: ((now - dayStart) / 3_600_000) * HOUR_PX }}
                aria-hidden
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
