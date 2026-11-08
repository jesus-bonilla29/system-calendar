import { ipcMain } from 'electron'
import type { DbHandle } from './db'
import { countAppliedMigrations } from './db'
import { ipcContract, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'

type Handler<C extends IpcChannel> = (payload: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>

/** Registra un canal: valida la entrada y la salida con zod; nada sin validar llega a la lógica. */
function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const payload = ipcContract[channel].request.parse(raw) as IpcRequest<C>
    const result = await handler(payload)
    return ipcContract[channel].response.parse(result)
  })
}

export function registerIpc(dbHandle: DbHandle): void {
  handle('app:ping', ({ message }) => ({
    reply: `pong: ${message}`,
    receivedAt: new Date().toISOString()
  }))

  handle('app:dbInfo', () => {
    const tables = dbHandle.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' AND name <> '__drizzle_migrations' ORDER BY name")
      .all() as { name: string }[]
    return { migrationsApplied: countAppliedMigrations(dbHandle.sqlite), tables: tables.map((t) => t.name) }
  })
}
