import { useEffect, useState } from 'react'
import type { TriggerViewDto } from '@shared/ipc'
import { timeLabel } from '../lib/dates'

/** Ventana pequeña de aviso: siempre visible, con botones, independiente de las notificaciones de Windows. */
export function AlertWindow({ id }: { id: string }): React.JSX.Element {
  const [view, setView] = useState<TriggerViewDto | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Recordatorio'
    window.api
      .invoke('reminders:get', { id })
      .then(setView)
      .catch((e: unknown) => setError(String(e)))
  }, [id])

  const act = (action: 'start' | 'snooze' | 'dismiss'): void => {
    window.api
      .invoke('reminders:act', { id, action })
      .then((r) => {
        if (!r.ok) setError('No se pudo completar la acción')
      })
      .catch((e: unknown) => setError(String(e)))
  }

  if (view === undefined) return <main className="alert" />
  if (view === null) {
    return (
      <main className="alert">
        <p className="muted">Este recordatorio ya no existe.</p>
        <button type="button" onClick={() => window.close()}>
          Cerrar
        </button>
      </main>
    )
  }

  const when = timeLabel(view.occurrenceStart)
  return (
    <main className="alert" role="alertdialog" aria-labelledby="alert-title">
      <h1 id="alert-title">{view.title}</h1>
      <p>
        {view.offsetMinutes > 0
          ? `Empieza a las ${when} (en ${view.offsetMinutes} min)`
          : `Empieza ahora (${when})`}
      </p>
      {view.snoozeCount > 0 && (
        <p className="muted">
          Pospuesto {view.snoozeCount} {view.snoozeCount === 1 ? 'vez' : 'veces'}
        </p>
      )}
      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="primary" autoFocus onClick={() => act('start')}>
          Iniciar ahora
        </button>
        <button type="button" disabled={!view.canSnooze} onClick={() => act('snooze')}>
          Posponer {view.snoozeMinutes} min
        </button>
        <button type="button" onClick={() => act('dismiss')}>
          Descartar
        </button>
      </div>
    </main>
  )
}
