import { endOfDay, format, isSameMonth, isToday, setHours, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { OccurrenceDto } from '@shared/domain'
import { daysBetween, visibleRange } from '../lib/dates'
import { Chip } from './Chip'

const MAX_CHIPS = 3

interface Props {
  cursor: Date
  occurrences: OccurrenceDto[]
  onOpen: (occ: OccurrenceDto) => void
  onCreate: (startAt: number) => void
  onSelectDay: (day: Date) => void
}

export function MonthView({
  cursor,
  occurrences,
  onOpen,
  onCreate,
  onSelectDay
}: Props): React.JSX.Element {
  const { from, to } = visibleRange('month', cursor)
  const days = daysBetween(from, to)

  return (
    <div className="month">
      {days.slice(0, 7).map((d) => (
        <div key={d.toISOString()} className="dow">
          {format(d, 'EEE', { locale: es })}
        </div>
      ))}
      {days.map((d) => {
        const ds = startOfDay(d).getTime()
        const de = endOfDay(d).getTime()
        const list = occurrences.filter((o) => o.startAt <= de && (o.endAt ?? o.startAt) >= ds)
        const hidden = list.length - MAX_CHIPS
        const cls = `cell${isSameMonth(d, cursor) ? '' : ' other'}${isToday(d) ? ' today' : ''}`
        return (
          <div
            key={d.toISOString()}
            className={cls}
            onClick={() => onCreate(setHours(d, 9).getTime())}
          >
            <span className="num">{format(d, 'd')}</span>
            {list.slice(0, MAX_CHIPS).map((o) => (
              <Chip key={o.key} occ={o} onOpen={onOpen} />
            ))}
            {hidden > 0 && (
              <button
                type="button"
                className="more"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectDay(d)
                }}
              >
                +{hidden} más
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
