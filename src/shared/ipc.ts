import { z } from 'zod'
import type { eventChannels, ipcChannels } from './channels'
import { ITEM_STATUSES } from './constants'
import {
  itemDetailSchema,
  itemSchema,
  itemWithRecurrenceInputSchema,
  occurrenceSchema
} from './domain'

export type IpcChannel = (typeof ipcChannels)[number]
export type EventChannel = (typeof eventChannels)[number]

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:mm)')

export const quietHoursSchema = z.object({ enabled: z.boolean(), start: hhmm, end: hhmm })
export type QuietHoursDto = z.infer<typeof quietHoursSchema>

export const settingsSchema = z.object({
  quietHours: quietHoursSchema,
  autoLaunch: z.boolean(),
  /** El arranque con Windows solo se puede configurar en la versión instalada. */
  autoLaunchAvailable: z.boolean()
})
export type SettingsDto = z.infer<typeof settingsSchema>

export const triggerViewSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string(),
  occurrenceStart: z.number(),
  fireAt: z.number(),
  offsetMinutes: z.number(),
  snoozeCount: z.number(),
  snoozeMinutes: z.number(),
  maxSnoozes: z.number(),
  canSnooze: z.boolean()
})
export type TriggerViewDto = z.infer<typeof triggerViewSchema>

export const missedViewSchema = triggerViewSchema.extend({ status: z.enum(['missed', 'silenced']) })
export type MissedViewDto = z.infer<typeof missedViewSchema>

/**
 * Contrato IPC único entre main, preload y renderer.
 * Cada canal define el esquema de la petición y de la respuesta.
 * Main valida la petición antes de ejecutar nada.
 */
export const ipcContract = {
  'app:ping': {
    request: z.object({ message: z.string().max(200) }),
    response: z.object({ reply: z.string(), receivedAt: z.string() })
  },
  'app:dbInfo': {
    request: z.object({}),
    response: z.object({ migrationsApplied: z.number().int(), tables: z.array(z.string()) })
  },
  'items:create': {
    request: itemWithRecurrenceInputSchema,
    response: itemDetailSchema
  },
  'items:get': {
    request: z.object({ id: z.string().min(1) }),
    response: itemDetailSchema.nullable()
  },
  'items:update': {
    request: z.object({ id: z.string().min(1), data: itemWithRecurrenceInputSchema }),
    response: itemDetailSchema
  },
  'items:delete': {
    request: z.object({ id: z.string().min(1) }),
    response: z.object({ deleted: z.boolean() })
  },
  'items:setStatus': {
    request: z.object({
      id: z.string().min(1),
      status: z.enum(ITEM_STATUSES),
      note: z.string().max(500).optional()
    }),
    response: itemSchema
  },
  'items:skipOccurrence': {
    request: z.object({ id: z.string().min(1), originalStart: z.number().int() }),
    response: z.object({ ok: z.boolean() })
  },
  'items:listRange': {
    request: z.object({ from: z.number().int(), to: z.number().int() }),
    response: z.array(occurrenceSchema)
  },
  'items:listUnscheduled': {
    request: z.object({}),
    response: z.array(itemSchema)
  },
  'reminders:listMissed': {
    request: z.object({}),
    response: z.array(missedViewSchema)
  },
  'reminders:acknowledge': {
    request: z.object({ ids: z.array(z.string()).max(500).optional() }),
    response: z.object({ ok: z.boolean() })
  },
  'reminders:get': {
    request: z.object({ id: z.string().min(1) }),
    response: triggerViewSchema.nullable()
  },
  'reminders:act': {
    request: z.object({
      id: z.string().min(1),
      action: z.enum(['start', 'snooze', 'dismiss'])
    }),
    response: z.object({ ok: z.boolean() })
  },
  'settings:get': {
    request: z.object({}),
    response: settingsSchema
  },
  'settings:set': {
    request: z.object({
      quietHours: quietHoursSchema.optional(),
      autoLaunch: z.boolean().optional()
    }),
    response: settingsSchema
  }
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['response']>

export interface AgendaApi {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>
  /** Suscribe a un evento de main; devuelve la función para cancelar. */
  onEvent(channel: EventChannel, callback: () => void): () => void
}
