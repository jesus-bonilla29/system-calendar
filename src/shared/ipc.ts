import { z } from 'zod'
import type { ipcChannels } from './channels'

export type IpcChannel = (typeof ipcChannels)[number]

/**
 * Contrato IPC único entre main, preload y renderer.
 * Cada canal define el esquema de la petición y de la respuesta.
 * Main valida la petición antes de ejecutar nada.
 */
export const ipcContract = {
  'app:ping': {
    request: z.object({ message: z.string().max(200) }),
    response: z.object({ reply: z.string(), receivedAt: z.string() })
  }
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['response']>

export interface AgendaApi {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>
}
