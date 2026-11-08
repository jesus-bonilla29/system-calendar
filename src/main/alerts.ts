import { BrowserWindow, Notification, screen } from 'electron'
import type { Notifier, TriggerView } from './scheduler/scheduler'
import { loadRenderer, secureWebPreferences } from './windows'

const WIDTH = 440
const HEIGHT = 200
const MARGIN = 16

interface Deps {
  /** El usuario pulsó el toast nativo: mostrar la ventana principal. */
  onNativeClick: () => void
  /** El usuario cerró la ventana de aviso sin elegir nada. */
  onIgnored: (triggerId: string) => void
  log: (msg: string, err?: unknown) => void
}

const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export function describeTrigger(t: TriggerView): string {
  const when = timeFormat.format(t.occurrenceStart)
  if (t.offsetMinutes <= 0) return `Empieza ahora (${when})`
  return `Empieza a las ${when} (en ${t.offsetMinutes} min)`
}

/**
 * Avisa de dos formas: una ventana propia siempre visible con botones (fiable aunque las
 * notificaciones de Windows estén apagadas) y un toast nativo sin botones.
 */
export class AlertManager implements Notifier {
  private readonly windows = new Map<string, BrowserWindow>()
  private readonly handled = new Set<string>()

  constructor(private readonly deps: Deps) {}

  notify(t: TriggerView): void {
    this.openWindow(t)
    this.nativeToast(t)
  }

  /** Cierra la ventana de un aviso ya resuelto (sin contarlo como ignorado). */
  closeResolved(id: string): void {
    const win = this.windows.get(id)
    if (!win || win.isDestroyed()) return
    this.handled.add(id)
    win.close()
  }

  private openWindow(t: TriggerView): void {
    const existing = this.windows.get(t.id)
    if (existing && !existing.isDestroyed()) {
      existing.showInactive()
      return
    }
    const area = screen.getPrimaryDisplay().workArea
    const slot = this.windows.size
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: area.x + area.width - WIDTH - MARGIN,
      y: area.y + area.height - (HEIGHT + 8) * (slot + 1) - MARGIN + 8,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: 'Recordatorio',
      webPreferences: secureWebPreferences()
    })
    win.setMenu(null)
    win.once('ready-to-show', () => win.showInactive())
    win.on('closed', () => {
      this.windows.delete(t.id)
      if (!this.handled.delete(t.id)) this.deps.onIgnored(t.id)
    })
    this.windows.set(t.id, win)
    loadRenderer(win, `alert/${t.id}`)
  }

  private nativeToast(t: TriggerView): void {
    if (!Notification.isSupported()) return
    try {
      const n = new Notification({ title: t.title, body: describeTrigger(t) })
      n.on('click', () => this.deps.onNativeClick())
      n.on('failed', (_e, error) => this.deps.log(`Toast nativo no entregado: ${error}`))
      n.show()
    } catch (err) {
      this.deps.log('Toast nativo falló', err)
    }
  }
}
