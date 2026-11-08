import { app, ipcMain } from 'electron'
import { ipcContract, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'
import type { AlertManager } from './alerts'
import type { DbHandle } from './db'
import { countAppliedMigrations } from './db'
import type { Scheduler } from './scheduler/scheduler'
import type { AgendaService } from './services/agenda'
import { DEFAULT_QUIET_HOURS, type QuietHours, type SettingsService } from './services/settings'

type Handler<C extends IpcChannel> = (
  payload: IpcRequest<C>
) => IpcResponse<C> | Promise<IpcResponse<C>>

/** Registra un canal: valida la entrada y la salida con zod; nada sin validar llega a la lógica. */
function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const payload = ipcContract[channel].request.parse(raw) as IpcRequest<C>
    const result = await handler(payload)
    return ipcContract[channel].response.parse(result)
  })
}

export interface IpcContext {
  dbHandle: DbHandle
  agenda: AgendaService
  scheduler: Scheduler
  settings: SettingsService
  alerts: AlertManager
  /** Avisa a todas las ventanas de que los datos cambiaron. */
  broadcast: () => void
}

export function registerIpc(ctx: IpcContext): void {
  const { dbHandle, agenda, scheduler, settings, alerts, broadcast } = ctx

  /** Ejecuta un cambio de datos y deja al scheduler y a las ventanas al día. */
  const mutate = <T>(fn: () => T): T => {
    const result = fn()
    scheduler.sync()
    broadcast()
    return result
  }

  const readSettings = (): IpcResponse<'settings:get'> => ({
    quietHours: settings.get<QuietHours>('quietHours', DEFAULT_QUIET_HOURS),
    autoLaunch: app.getLoginItemSettings().openAtLogin,
    autoLaunchAvailable: app.isPackaged
  })

  handle('app:ping', ({ message }) => ({
    reply: `pong: ${message}`,
    receivedAt: new Date().toISOString()
  }))

  handle('app:dbInfo', () => {
    const tables = dbHandle.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' AND name <> '__drizzle_migrations' ORDER BY name"
      )
      .all() as { name: string }[]
    return {
      migrationsApplied: countAppliedMigrations(dbHandle.sqlite),
      tables: tables.map((t) => t.name)
    }
  })

  handle('items:create', (data) => mutate(() => agenda.create(data)))
  handle('items:get', ({ id }) => agenda.get(id))
  handle('items:update', ({ id, data }) => mutate(() => agenda.update(id, data)))
  handle('items:delete', ({ id }) => ({ deleted: mutate(() => agenda.delete(id)) }))
  handle('items:setStatus', ({ id, status, note }) =>
    mutate(() => agenda.setStatus(id, status, note))
  )
  handle('items:skipOccurrence', ({ id, originalStart }) => ({
    ok: mutate(() => agenda.skipOccurrence(id, originalStart))
  }))
  handle('items:listRange', ({ from, to }) => agenda.listRange(from, to))
  handle('items:listUnscheduled', () => agenda.listUnscheduled())

  handle('reminders:listMissed', () => scheduler.listMissed())
  handle('reminders:acknowledge', ({ ids }) => {
    scheduler.acknowledgeMissed(ids)
    broadcast()
    return { ok: true }
  })
  handle('reminders:get', ({ id }) => scheduler.view(id))
  handle('reminders:act', ({ id, action }) => {
    if (!scheduler.view(id)) return { ok: false }
    let ok = true
    if (action === 'start') {
      const itemId = scheduler.resolve(id, 'started')
      const detail = itemId ? agenda.get(itemId) : null
      if (itemId && detail?.item.status === 'pending') {
        agenda.setStatus(itemId, 'in_progress', 'Iniciado desde un recordatorio')
      }
    } else if (action === 'snooze') {
      ok = scheduler.snooze(id) !== null
    } else {
      scheduler.resolve(id, 'dismissed')
    }
    if (ok) alerts.closeResolved(id)
    broadcast()
    return { ok }
  })

  handle('settings:get', () => readSettings())
  handle('settings:set', ({ quietHours, autoLaunch }) => {
    if (quietHours) settings.set('quietHours', quietHours)
    if (autoLaunch !== undefined) {
      if (!app.isPackaged) {
        throw new Error('El arranque con Windows solo se puede activar en la versión instalada')
      }
      app.setLoginItemSettings({ openAtLogin: autoLaunch, args: ['--hidden'] })
    }
    return readSettings()
  })
}
