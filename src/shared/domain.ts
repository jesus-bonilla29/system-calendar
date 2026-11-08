import { z } from 'zod'
import { FLEXIBILITIES, ITEM_KINDS, ITEM_STATUSES } from './constants'
import { isValidTimezone, validateRRule } from './recurrence'

const ms = z.number().int().min(0).max(8_640_000_000_000_000)

/** Campos editables de un ítem (tarea, evento o hábito). */
export const itemInputSchema = z
  .object({
    kind: z.enum(ITEM_KINDS),
    title: z.string().trim().min(1, 'El título es obligatorio').max(200),
    notes: z.string().max(10_000),
    startAt: ms.nullable(),
    endAt: ms.nullable(),
    allDay: z.boolean(),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    dueAt: ms.nullable(),
    priority: z.number().int().min(1).max(4),
    category: z.string().trim().max(60).nullable(),
    status: z.enum(ITEM_STATUSES),
    flexibility: z.enum(FLEXIBILITIES)
  })
  .superRefine((v, ctx) => {
    if (v.endAt !== null && v.startAt === null) {
      ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'El fin requiere un inicio' })
    }
    if (v.endAt !== null && v.startAt !== null && v.endAt < v.startAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'El fin no puede ser anterior al inicio'
      })
    }
  })
export type ItemInput = z.infer<typeof itemInputSchema>

export const recurrenceInputSchema = z.object({
  rrule: z
    .string()
    .max(500)
    .superRefine((v, ctx) => {
      const err = validateRRule(v)
      if (err) ctx.addIssue({ code: 'custom', message: err })
    }),
  timezone: z.string().refine(isValidTimezone, 'Zona horaria no válida')
})
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>

/** Ítem + recurrencia opcional, como se envían al crear o reemplazar. */
export const itemWithRecurrenceInputSchema = z
  .object({
    item: itemInputSchema,
    recurrence: recurrenceInputSchema.nullable()
  })
  .superRefine((v, ctx) => {
    if (v.recurrence && v.item.startAt === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['item', 'startAt'],
        message: 'Una tarea recurrente necesita fecha de inicio'
      })
    }
  })
export type ItemWithRecurrenceInput = z.infer<typeof itemWithRecurrenceInputSchema>

export const itemSchema = z.object({
  id: z.string(),
  kind: z.enum(ITEM_KINDS),
  title: z.string(),
  notes: z.string(),
  startAt: z.number().nullable(),
  endAt: z.number().nullable(),
  allDay: z.boolean(),
  estimatedMinutes: z.number().nullable(),
  dueAt: z.number().nullable(),
  priority: z.number(),
  category: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  flexibility: z.enum(FLEXIBILITIES),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type ItemDto = z.infer<typeof itemSchema>

export const recurrenceSchema = z.object({
  rrule: z.string(),
  timezone: z.string(),
  exceptions: z.array(z.number())
})
export type RecurrenceDto = z.infer<typeof recurrenceSchema>

export const itemDetailSchema = z.object({
  item: itemSchema,
  recurrence: recurrenceSchema.nullable()
})
export type ItemDetailDto = z.infer<typeof itemDetailSchema>

/** Una aparición concreta de un ítem en el calendario (única o de una serie). */
export const occurrenceSchema = z.object({
  key: z.string(),
  itemId: z.string(),
  title: z.string(),
  kind: z.enum(ITEM_KINDS),
  status: z.enum(ITEM_STATUSES),
  priority: z.number(),
  category: z.string().nullable(),
  allDay: z.boolean(),
  startAt: z.number(),
  endAt: z.number().nullable(),
  /** Inicio original (clave de excepción) para omitir esta ocurrencia. */
  originalStart: z.number(),
  recurring: z.boolean()
})
export type OccurrenceDto = z.infer<typeof occurrenceSchema>
