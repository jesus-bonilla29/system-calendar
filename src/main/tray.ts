import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'

export interface TrayActions {
  open: () => void
  quit: () => void
}

/** Icono de bandeja: la app sigue viva (y avisando) con la ventana cerrada. */
export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icon.png'))
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16 }))
  tray.setToolTip('Agenda')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Agenda', click: actions.open },
      { type: 'separator' },
      { label: 'Salir', click: actions.quit }
    ])
  )
  tray.on('click', actions.open)
  return tray
}
