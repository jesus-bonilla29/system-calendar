import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ItemDto } from '@shared/domain'
import { PRIORITY_LABEL } from '../lib/labels'

interface Props {
  items: ItemDto[]
  onOpen: (id: string) => void
  onToggle: (item: ItemDto) => void
}

export function UnscheduledPanel({ items, onOpen, onToggle }: Props): React.JSX.Element {
  return (
    <aside className="side" aria-label="Tareas sin fecha">
      <h2>Sin fecha</h2>
      {items.length === 0 ? (
        <p className="muted">No hay tareas sin fecha.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.id} className={it.status === 'done' ? 'done' : ''}>
              <input
                type="checkbox"
                checked={it.status === 'done'}
                aria-label={`Completar ${it.title}`}
                onChange={() => onToggle(it)}
              />
              <button type="button" className="title" onClick={() => onOpen(it.id)}>
                {it.title}
                <div className="muted">
                  {PRIORITY_LABEL[it.priority]}
                  {it.dueAt !== null &&
                    ` · vence ${format(it.dueAt, "d 'de' MMM", { locale: es })}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
