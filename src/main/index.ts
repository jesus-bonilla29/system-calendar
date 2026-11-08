import { join } from 'node:path'
import { app, BrowserWindow, Notification, powerMonitor, session, type Tray } from 'electron'
import { AlertManager } from './alerts'
import { openDatabase } from './db'
import { registerIpc } from './ipc'
import { Scheduler } from './scheduler/scheduler'
import { AgendaService } from './services/agenda'
import {
  DEFAULT_QUIET_HOURS,
  isQuietAt,
  SettingsService,
  type QuietHours
} from './services/settings'
import { createTray } from './tray'
import { loadRenderer, secureWebPreferences } from './windows'

const isDev = !app.isPackaged
const log = (msg: string, err?: unknown): void => console.log(`[agenda] ${msg}`, err ?? '')

function setupSecurity(): void {
  // CSP estricta; en desarrollo Vite necesita scripts inline y websocket para HMR.
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*; img-src 'self' data:"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (e) => e.preventDefault())
  })
}

// Una sola instancia: abrir la app otra vez solo muestra la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  app.setAppUserModelId('com.agenda.app')

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let quitting = false
  const startHidden = process.argv.includes('--hidden')

  const broadcast = (): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('data:changed')
    }
  }

  function createMainWindow(show: boolean): BrowserWindow {
    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      title: 'Agenda',
      webPreferences: secureWebPreferences()
    })
    if (show) win.once('ready-to-show', () => win.show())
    // Cerrar la ventana la oculta: la app sigue en la bandeja enviando recordatorios.
    win.on('close', (e) => {
      if (quitting) return
      e.preventDefault()
      win.hide()
    })
    win.on('closed', () => {
      mainWindow = null
    })
    loadRenderer(win)
    return win
  }

  function showMain(): void {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow(true)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  app.on('second-instance', () => showMain())
  app.on('before-quit', () => {
    quitting = true
  })
  // Con bandeja, cerrar todas las ventanas no cierra la app.
  app.on('window-all-closed', () => undefined)

  void app.whenReady().then(() => {
    setupSecurity()

    // La base vive en %APPDATA%\agenda (nunca en la carpeta del proyecto).
    const dbHandle = openDatabase(
      join(app.getPath('userData'), 'agenda.db'),
      join(app.getAppPath(), 'drizzle')
    )
    const agenda = new AgendaService(dbHandle.db)
    const settings = new SettingsService(dbHandle.db)

    // El aviso ignorado necesita al scheduler, que a su vez necesita al gestor de avisos.
    const onIgnored = (id: string): void => {
      scheduler.resolve(id, 'dismissed')
      broadcast()
    }
    const alerts = new AlertManager({ onNativeClick: showMain, onIgnored, log })
    const scheduler = new Scheduler({
      db: dbHandle.db,
      notifier: alerts,
      isQuiet: (t) => isQuietAt(settings.get<QuietHours>('quietHours', DEFAULT_QUIET_HOURS), t),
      log
    })

    registerIpc({ dbHandle, agenda, scheduler, settings, alerts, broadcast })

    mainWindow = createMainWindow(!startHidden)
    tray = createTray({
      open: showMain,
      quit: () => {
        quitting = true
        app.quit()
      }
    })

    /** Avisa de lo que se perdió mientras la app no estaba vigilando. */
    const announceMissed = (count: number): void => {
      broadcast()
      if (count === 0) return
      tray?.setToolTip(`Agenda · ${count} aviso(s) perdido(s)`)
      if (!mainWindow?.isVisible() && Notification.isSupported()) {
        const n = new Notification({
          title: 'Mientras no estabas',
          body: `${count} recordatorio(s) vencieron sin avisar. Ábrelos para verlos.`
        })
        n.on('click', showMain)
        n.on('failed', (_e, error) => log(`Toast nativo no entregado: ${error}`))
        n.show()
      }
    }

    const onWake = (reason: string): void => {
      log(`Reanudación (${reason}): buscando recordatorios perdidos`)
      announceMissed(scheduler.recover().length)
    }
    powerMonitor.on('resume', () => onWake('suspensión'))
    powerMonitor.on('unlock-screen', () => onWake('desbloqueo'))

    announceMissed(scheduler.start().length)
    app.on('activate', showMain)
  })
}
