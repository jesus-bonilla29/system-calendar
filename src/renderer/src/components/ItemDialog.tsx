import { useEffect, useState } from 'react'
import { addHours, startOfHour } from 'date-fns'
import {
  FLEXIBILITIES,
  ITEM_KINDS,
  ITEM_STATUSES,
  type Flexibility,
  type ItemKind,
  type ItemStatus
} from '@shared/constants'
import {
  itemWithRecurrenceInputSchema,
  type ItemDetailDto,
  type OccurrenceDto,
  type ReminderInput
} from '@shared/domain'
import { fromInputs, systemTimezone, toDateInput, toTimeInput } from '../lib/dates'
import {
  FLEXIBILITY_LABEL,
  KIND_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_SHORT
} from '../lib/labels'
import {
  buildRRule,
  defaultRepeat,
  parseRRule,
  type RepeatConfig,
  type RepeatEnd,
  type RepeatFreq
} from '../lib/repeat'

interface Props {
  /** Ítem existente (modo edición) o null (modo creación). */
  detail: ItemDetailDto | null
  /** Ocurrencia pulsada, para poder omitirla si pertenece a una serie. */
  occurrence: OccurrenceDto | null
  /** Inicio sugerido al crear. */
  defaultStart: number | null
  onClose: () => void
  onChanged: () => void
}

type RepeatMode = 'none' | 'simple' | 'advanced'

interface FormState {
  kind: ItemKind
  title: string
  notes: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  estimated: string
  dueDate: string
  dueTime: string
  priority: number
  category: string
  status: ItemStatus
  flexibility: Flexibility
  repeatMode: RepeatMode
  repeat: RepeatConfig
  rawRule: string
  reminders: ReminderInput[]
}

function initialState(detail: ItemDetailDto | null, defaultStart: number | null): FormState {
  if (!detail) {
    const start = defaultStart ?? addHours(startOfHour(new Date()), 1).getTime()
    return {
      kind: 'task',
      title: '',
      notes: '',
      allDay: false,
      startDate: toDateInput(start),
      startTime: toTimeInput(start),
      endDate: '',
      endTime: '',
      estimated: '',
      dueDate: '',
      dueTime: '',
      priority: 3,
      category: '',
      status: 'pending',
      flexibility: 'rigid',
      repeatMode: 'none',
      repeat: defaultRepeat(),
      rawRule: '',
      reminders: []
    }
  }
  const { item, recurrence } = detail
  const parsed = recurrence ? parseRRule(recurrence.rrule) : null
  return {
    kind: item.kind,
    title: item.title,
    notes: item.notes,
    allDay: item.allDay,
    startDate: item.startAt !== null ? toDateInput(item.startAt) : '',
    startTime: item.startAt !== null ? toTimeInput(item.startAt) : '',
    endDate: item.endAt !== null ? toDateInput(item.endAt) : '',
    endTime: item.endAt !== null ? toTimeInput(item.endAt) : '',
    estimated: item.estimatedMinutes !== null ? String(item.estimatedMinutes) : '',
    dueDate: item.dueAt !== null ? toDateInput(item.dueAt) : '',
    dueTime: item.dueAt !== null ? toTimeInput(item.dueAt) : '',
    priority: item.priority,
    category: item.category ?? '',
    status: item.status,
    flexibility: item.flexibility,
    repeatMode: !recurrence ? 'none' : parsed ? 'simple' : 'advanced',
    repeat: parsed ?? defaultRepeat(),
    rawRule: recurrence?.rrule ?? '',
    reminders: detail.reminders.map(({ offsetMinutes, snoozeMinutes, maxSnoozes }) => ({
      offsetMinutes,
      snoozeMinutes,
      maxSnoozes
    }))
  }
}

function toPayload(f: FormState, timezone: string): unknown {
  const endDate = f.endDate || (f.endTime ? f.startDate : '')
  const rrule = f.repeatMode === 'simple' ? buildRRule(f.repeat) : f.rawRule.trim()
  const estimated = f.estimated.trim() === '' ? null : Number(f.estimated)
  return {
    item: {
      kind: f.kind,
      title: f.title,
      notes: f.notes,
      startAt: fromInputs(f.startDate, f.allDay ? '00:00' : f.startTime),
      endAt: endDate ? fromInputs(endDate, f.allDay ? '23:59' : f.endTime || f.startTime) : null,
      allDay: f.allDay,
      estimatedMinutes: estimated,
      dueAt: fromInputs(f.dueDate, f.dueTime),
      priority: f.priority,
      category: f.category.trim() === '' ? null : f.category,
      status: f.status,
      flexibility: f.flexibility
    },
    recurrence: f.repeatMode === 'none' ? null : { rrule, timezone },
    reminders: f.reminders
  }
}

export function ItemDialog({
  detail,
  occurrence,
  defaultStart,
  onClose,
  onChanged
}: Props): React.JSX.Element {
  const [f, setF] = useState<FormState>(() => initialState(detail, defaultStart))
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const timezone = detail?.recurrence?.timezone ?? systemTimezone()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setF((prev) => ({ ...prev, [key]: value }))
  const setRepeat = (patch: Partial<RepeatConfig>): void =>
    setF((prev) => ({ ...prev, repeat: { ...prev.repeat, ...patch } }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setErrors([])
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)])
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    const parsed = itemWithRecurrenceInputSchema.safeParse(toPayload(f, timezone))
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message))
      return
    }
    void run(async () => {
      if (detail) await window.api.invoke('items:update', { id: detail.item.id, data: parsed.data })
      else await window.api.invoke('items:create', parsed.data)
    })
  }

  const remove = (): void => {
    if (!detail) return
    const msg = detail.recurrence
      ? 'Se eliminará toda la serie. ¿Continuar?'
      : '¿Eliminar este elemento?'
    if (!window.confirm(msg)) return
    void run(async () => {
      await window.api.invoke('items:delete', { id: detail.item.id })
    })
  }

  const skip = (): void => {
    if (!detail || !occurrence) return
    void run(async () => {
      const r = await window.api.invoke('items:skipOccurrence', {
        id: detail.item.id,
        originalStart: occurrence.originalStart
      })
      if (!r.ok) throw new Error('No se pudo omitir esta ocurrencia')
    })
  }

  const setReminder = (i: number, patch: Partial<ReminderInput>): void =>
    setF((p) => ({
      ...p,
      reminders: p.reminders.map((r, j) => (j === i ? { ...r, ...patch } : r))
    }))
  const addReminder = (): void =>
    setF((p) => ({
      ...p,
      reminders: [...p.reminders, { offsetMinutes: 10, snoozeMinutes: 10, maxSnoozes: 3 }]
    }))
  const removeReminder = (i: number): void =>
    setF((p) => ({ ...p, reminders: p.reminders.filter((_, j) => j !== i) }))

  const toggleDay = (d: number): void => {
    const days = f.repeat.weekdays.includes(d)
      ? f.repeat.weekdays.filter((x) => x !== d)
      : [...f.repeat.weekdays, d]
    setRepeat({ weekdays: days })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h2 id="dlg-title">{detail ? 'Editar' : 'Nuevo elemento'}</h2>

        <div className="row">
          <div className="field" style={{ flex: 3 }}>
            <label htmlFor="f-title">Título</label>
            <input
              id="f-title"
              autoFocus
              value={f.title}
              maxLength={200}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-kind">Tipo</label>
            <select
              id="f-kind"
              value={f.kind}
              onChange={(e) => set('kind', e.target.value as ItemKind)}
            >
              {ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={f.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
          />
          Todo el día
        </label>

        <div className="row">
          <div className="field">
            <label htmlFor="f-sd">Inicio (fecha)</label>
            <input
              id="f-sd"
              type="date"
              value={f.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>
          {!f.allDay && (
            <div className="field">
              <label htmlFor="f-st">Inicio (hora)</label>
              <input
                id="f-st"
                type="time"
                value={f.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="f-ed">Fin (fecha)</label>
            <input
              id="f-ed"
              type="date"
              value={f.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </div>
          {!f.allDay && (
            <div className="field">
              <label htmlFor="f-et">Fin (hora)</label>
              <input
                id="f-et"
                type="time"
                value={f.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            </div>
          )}
        </div>
        <span className="muted">Deja el inicio vacío para una tarea sin fecha.</span>

        <div className="row">
          <div className="field">
            <label htmlFor="f-est">Duración estimada (min)</label>
            <input
              id="f-est"
              type="number"
              min={1}
              max={1440}
              value={f.estimated}
              onChange={(e) => set('estimated', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-dd">Fecha límite</label>
            <input
              id="f-dd"
              type="date"
              value={f.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-dt">Hora límite</label>
            <input
              id="f-dt"
              type="time"
              value={f.dueTime}
              onChange={(e) => set('dueTime', e.target.value)}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="f-pri">Prioridad</label>
            <select
              id="f-pri"
              value={f.priority}
              onChange={(e) => set('priority', Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-status">Estado</label>
            <select
              id="f-status"
              value={f.status}
              onChange={(e) => set('status', e.target.value as ItemStatus)}
            >
              {ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-flex">Horario</label>
            <select
              id="f-flex"
              value={f.flexibility}
              onChange={(e) => set('flexibility', e.target.value as Flexibility)}
            >
              {FLEXIBILITIES.map((x) => (
                <option key={x} value={x}>
                  {FLEXIBILITY_LABEL[x]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-cat">Categoría</label>
            <input
              id="f-cat"
              value={f.category}
              maxLength={60}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-notes">Notas</label>
          <textarea
            id="f-notes"
            rows={3}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <fieldset>
          <legend>Repetición</legend>
          <div className="field">
            <label htmlFor="f-rep">Se repite</label>
            <select
              id="f-rep"
              value={f.repeatMode}
              onChange={(e) => {
                const mode = e.target.value as RepeatMode
                setF((p) => ({
                  ...p,
                  repeatMode: mode,
                  rawRule: mode === 'advanced' && !p.rawRule ? buildRRule(p.repeat) : p.rawRule
                }))
              }}
            >
              <option value="none">No se repite</option>
              <option value="simple">Personalizada</option>
              <option value="advanced">Regla avanzada (RRULE)</option>
            </select>
          </div>

          {f.repeatMode === 'simple' && (
            <>
              <div className="row">
                <div className="field">
                  <label htmlFor="f-freq">Frecuencia</label>
                  <select
                    id="f-freq"
                    value={f.repeat.freq}
                    onChange={(e) => setRepeat({ freq: e.target.value as RepeatFreq })}
                  >
                    <option value="DAILY">Diaria</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-int">Cada</label>
                  <input
                    id="f-int"
                    type="number"
                    min={1}
                    max={365}
                    value={f.repeat.interval}
                    onChange={(e) => setRepeat({ interval: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
              </div>

              {f.repeat.freq === 'WEEKLY' && (
                <div className="field">
                  <span className="label">Días (si no eliges ninguno, el día del inicio)</span>
                  <div className="weekdays">
                    {WEEKDAY_SHORT.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={WEEKDAY_LONG[i]}
                        aria-pressed={f.repeat.weekdays.includes(i)}
                        className={f.repeat.weekdays.includes(i) ? 'active' : ''}
                        onClick={() => toggleDay(i)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="row">
                <div className="field">
                  <label htmlFor="f-end">Termina</label>
                  <select
                    id="f-end"
                    value={f.repeat.end}
                    onChange={(e) => setRepeat({ end: e.target.value as RepeatEnd })}
                  >
                    <option value="never">Nunca</option>
                    <option value="count">Después de N veces</option>
                    <option value="until">El día…</option>
                  </select>
                </div>
                {f.repeat.end === 'count' && (
                  <div className="field">
                    <label htmlFor="f-count">Veces</label>
                    <input
                      id="f-count"
                      type="number"
                      min={1}
                      max={1000}
                      value={f.repeat.count}
                      onChange={(e) => setRepeat({ count: Math.max(1, Number(e.target.value)) })}
                    />
                  </div>
                )}
                {f.repeat.end === 'until' && (
                  <div className="field">
                    <label htmlFor="f-until">Fecha final</label>
                    <input
                      id="f-until"
                      type="date"
                      value={f.repeat.until}
                      onChange={(e) => setRepeat({ until: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {f.repeatMode === 'advanced' && (
            <div className="field">
              <label htmlFor="f-raw">Regla RRULE</label>
              <input
                id="f-raw"
                value={f.rawRule}
                placeholder="FREQ=MONTHLY;BYDAY=1MO"
                onChange={(e) => set('rawRule', e.target.value)}
              />
            </div>
          )}
          {f.repeatMode !== 'none' && <span className="muted">Zona horaria: {timezone}</span>}
        </fieldset>

        <fieldset>
          <legend>Recordatorios</legend>
          {f.reminders.length === 0 && <span className="muted">Sin recordatorios.</span>}
          {f.reminders.map((r, i) => (
            <div className="row reminder-row" key={i}>
              <div className="field">
                <label htmlFor={`r-off-${i}`}>Avisar (min antes)</label>
                <input
                  id={`r-off-${i}`}
                  type="number"
                  min={0}
                  max={10080}
                  value={r.offsetMinutes}
                  onChange={(e) => setReminder(i, { offsetMinutes: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor={`r-snz-${i}`}>Posponer (min)</label>
                <input
                  id={`r-snz-${i}`}
                  type="number"
                  min={1}
                  max={1440}
                  value={r.snoozeMinutes}
                  onChange={(e) => setReminder(i, { snoozeMinutes: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor={`r-max-${i}`}>Máx. veces</label>
                <input
                  id={`r-max-${i}`}
                  type="number"
                  min={0}
                  max={20}
                  value={r.maxSnoozes}
                  onChange={(e) => setReminder(i, { maxSnoozes: Number(e.target.value) })}
                />
              </div>
              <button
                type="button"
                className="danger"
                aria-label="Quitar recordatorio"
                onClick={() => removeReminder(i)}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button type="button" onClick={addReminder}>
              + Añadir recordatorio
            </button>
          </div>
          {f.reminders.length > 0 && !f.startDate && (
            <span className="muted">Los recordatorios necesitan una fecha de inicio.</span>
          )}
        </fieldset>

        {errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}

        <div className="actions">
          {detail && (
            <button type="button" className="danger" disabled={busy} onClick={remove}>
              {detail.recurrence ? 'Eliminar serie' : 'Eliminar'}
            </button>
          )}
          {detail?.recurrence && occurrence && (
            <button type="button" disabled={busy} onClick={skip}>
              Omitir esta ocurrencia
            </button>
          )}
          <span className="spacer" />
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {detail?.recurrence ? 'Guardar toda la serie' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
