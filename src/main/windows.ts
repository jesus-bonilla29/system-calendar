import { join } from 'node:path'
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'

/** Opciones de seguridad comunes a todas las ventanas: aislamiento activo y sin Node. */
export function secureWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
}

/** Carga la interfaz React; `hash` selecciona la pantalla (p. ej. "alert/<id>"). */
export function loadRenderer(win: BrowserWindow, hash?: string): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void win.loadURL(hash ? `${dev}#${hash}` : dev)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}
