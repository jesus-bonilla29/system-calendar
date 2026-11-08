import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemDetailDto, ItemDto, OccurrenceDto } from '@shared/domain'
import { ItemDialog } from './components/ItemDialog'
import { MonthView } from './components/MonthView'
import { TimeGrid } from './components/TimeGrid'
import { UnscheduledPanel } from './components/UnscheduledPanel'
import { daysBetween, shiftCursor, titleFor, visibleRange, type ViewKind } from './lib/dates'

interface DialogState {
  detail: ItemDetailDto | null
  occurrence: OccurrenceDto | null
  defaultStart: number | null
}

const VIEWS: { id: ViewKind; label: string }[] = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' }
]

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewKind>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [occurrences, setOccurrences] = useState<OccurrenceDto[]>([])
  const [unscheduled, setUnscheduled] = useState<ItemDto[]>([])
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  const { from, to } = visibleRange(view, cursor)
  const fromMs = from.getTime()
  const toMs = to.getTime()

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.invoke('items:listRange', { from: fromMs, to: toMs }),
      window.api.invoke('items:listUnscheduled', {})
    ])
      .then(([occ, uns]) => {
        if (cancelled) return
        setOccurrences(occ)
        setUnscheduled(uns)
        setError(null)
      })
      .catch((e: unknown) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [fromMs, toMs, tick])

  // Las vistas con horas abren a las 07:00 en lugar de a medianoche.
  useEffect(() => {
    if (view !== 'month' && mainRef.current) mainRef.current.scrollTop = 7 * 48
  }, [view])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  const openNew = (startAt: number | null = null): void =>
    setDialog({ detail: null, occurrence: null, defaultStart: startAt })

  const openExisting = async (id: string, occurrence: OccurrenceDto | null): Promise<void> => {
    try {
      const detail = await window.api.invoke('items:get', { id })
      if (detail) setDialog({ detail, occurrence, defaultStart: null })
    } catch (e) {
      setError(String(e))
    }
  }

  const toggleDone = async (item: ItemDto): Promise<void> => {
    try {
      await window.api.invoke('items:setStatus', {
        id: item.id,
        status: item.status === 'done' ? 'pending' : 'done'
      })
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  const days = daysBetween(from, to)

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" onClick={() => setCursor(new Date())}>
          Hoy
        </button>
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => setCursor((c) => shiftCursor(view, c, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => setCursor((c) => shiftCursor(view, c, 1))}
        >
          ›
        </button>
        <h1>{titleFor(view, cursor)}</h1>
        <div className="segmented" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'active' : ''}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" className="primary" onClick={() => openNew()}>
          + Nuevo
        </button>
      </header>

      <main className="main" ref={mainRef}>
        {error && (
          <p className="errors" role="alert">
            {error}
          </p>
        )}
        {view === 'month' ? (
          <MonthView
            cursor={cursor}
            occurrences={occurrences}
            onOpen={(o) => void openExisting(o.itemId, o)}
            onCreate={openNew}
            onSelectDay={(d) => {
              setCursor(d)
              setView('day')
            }}
          />
        ) : (
          <TimeGrid
            days={view === 'day' ? [cursor] : days}
            occurrences={occurrences}
            onOpen={(o) => void openExisting(o.itemId, o)}
            onCreate={openNew}
          />
        )}
      </main>

      <UnscheduledPanel
        items={unscheduled}
        onOpen={(id) => void openExisting(id, null)}
        onToggle={(it) => void toggleDone(it)}
      />

      {dialog && (
        <ItemDialog
          key={dialog.detail?.item.id ?? `new-${dialog.defaultStart}`}
          {...dialog}
          onClose={closeDialog}
          onChanged={() => {
            closeDialog()
            refresh()
          }}
        />
      )}
    </div>
  )
}
