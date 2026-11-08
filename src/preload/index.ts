import { contextBridge, ipcRenderer } from 'electron'
import { eventChannels, ipcChannels } from '@shared/channels'
import type { AgendaApi } from '@shared/ipc'

// Solo se exponen los canales del contrato; la interfaz nunca ve ipcRenderer ni Node.
const api: AgendaApi = {
  invoke(channel, payload) {
    if (!(ipcChannels as readonly string[]).includes(channel))
      throw new Error(`Canal no permitido: ${channel}`)
    return ipcRenderer.invoke(channel, payload)
  },
  onEvent(channel, callback) {
    if (!(eventChannels as readonly string[]).includes(channel)) {
      throw new Error(`Evento no permitido: ${channel}`)
    }
    const handler = (): void => callback()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
