import type { CSSProperties } from 'react'
import type { OccurrenceDto } from '@shared/domain'
import { timeLabel } from '../lib/dates'
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels'

interface Props {
  occ: OccurrenceDto
  onOpen: (occ: OccurrenceDto) => void
  style?: CSSProperties
  timed?: boolean
}

export function Chip({ occ, onOpen, style, timed }: Props): React.JSX.Element {
  const done = occ.status === 'done' || occ.status === 'cancelled' || occ.status === 'skipped'
  const label = occ.allDay ? occ.title : `${timeLabel(occ.startAt)} ${occ.title}`
  return (
    <button
      type="button"
      className={`chip p${occ.priority}${done ? ' done' : ''}${timed ? ' timed' : ''}`}
      style={style}
      title={`${occ.title} · ${STATUS_LABEL[occ.status]} · Prioridad ${PRIORITY_LABEL[occ.priority] ?? occ.priority}${occ.recurring ? ' · Se repite' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(occ)
      }}
    >
      {occ.recurring ? '↻ ' : ''}
      {label}
    </button>
  )
}
