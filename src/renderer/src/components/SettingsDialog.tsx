import { useEffect, useState } from 'react'
import type { SettingsDto } from '@shared/ipc'

export function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [s, setS] = useState<SettingsDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .invoke('settings:get', {})
      .then(setS)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = (patch: Partial<Pick<SettingsDto, 'quietHours' | 'autoLaunch'>>): void => {
    setError(null)
    window.api
      .invoke('settings:set', patch)
      .then(setS)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="set-title">
        <h2 id="set-title">Ajustes</h2>
        {!s ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            <fieldset>
              <legend>Horas de silencio</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.quietHours.enabled}
                  onChange={(e) =>
                    save({ quietHours: { ...s.quietHours, enabled: e.target.checked } })
                  }
                />
                No avisar con ventana ni toast; los recordatorios aparecerán en el resumen
              </label>
              <div className="row">
                <div className="field">
                  <label htmlFor="q-start">Desde</label>
                  <input
                    id="q-start"
                    type="time"
                    value={s.quietHours.start}
                    disabled={!s.quietHours.enabled}
                    onChange={(e) =>
                      e.target.value &&
                      save({ quietHours: { ...s.quietHours, start: e.target.value } })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="q-end">Hasta</label>
                  <input
                    id="q-end"
                    type="time"
                    value={s.quietHours.end}
                    disabled={!s.quietHours.enabled}
                    onChange={(e) =>
                      e.target.value &&
                      save({ quietHours: { ...s.quietHours, end: e.target.value } })
                    }
                  />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Sistema</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.autoLaunch}
                  disabled={!s.autoLaunchAvailable}
                  onChange={(e) => save({ autoLaunch: e.target.checked })}
                />
                Iniciar Agenda con Windows (en segundo plano, en la bandeja)
              </label>
              {!s.autoLaunchAvailable && (
                <span className="muted">
                  Solo disponible en la versión instalada, no en modo desarrollo.
                </span>
              )}
            </fieldset>
          </>
        )}
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
