import { z } from 'zod'
import type { ipcChannels } from './channels'
import { ITEM_STATUSES } from './constants'
import {
  itemDetailSchema,
  itemSchema,
  itemWithRecurrenceInputSchema,
  occurrenceSchema
} from './domain'

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
  }
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>
export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof ipcContract)[C]['response']>

export interface AgendaApi {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>
}
