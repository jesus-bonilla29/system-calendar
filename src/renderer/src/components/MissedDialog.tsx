import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { MissedViewDto } from '@shared/ipc'

interface Props {
  missed: MissedViewDto[]
  onAcknowledge: () => void
}

export function MissedDialog({ missed, onAcknowledge }: Props): React.JSX.Element {
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="missed-title">
        <h2 id="missed-title">Mientras no estabas</h2>
        <p className="muted">
          Estos recordatorios vencieron sin poder avisarte (equipo suspendido, app cerrada u horas
          de silencio).
        </p>
        <ul className="missed-list">
          {missed.map((m) => (
            <li key={m.id}>
              <strong>{m.title}</strong>
              <span className="muted">
                {format(m.occurrenceStart, "EEEE d 'de' MMM, HH:mm", { locale: es })} ·{' '}
                {m.status === 'silenced' ? 'en horas de silencio' : 'perdido'}
              </span>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="primary" autoFocus onClick={onAcknowledge}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
