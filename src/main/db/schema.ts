import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
  FLEXIBILITIES,
  ITEM_KINDS,
  ITEM_STATUSES,
  OPEN_MODES,
  RESOURCE_TYPES,
  TRIGGER_STATUSES
} from '../../shared/constants'

/*
 * Convenciones:
 * - Fechas: milisegundos UTC (integer). Evita ambigüedades con cambios de hora.
 * - IDs: texto (UUID generado en la aplicación).
 * - JSON: columnas text con { mode: 'json' } tipadas con $type.
 */

const id = () => text('id').primaryKey()
const createdAt = () =>
  integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
const updatedAt = () =>
  integer('updated_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)

/** Tarea, evento u hábito. Los campos del futuro planificador existen desde el inicio. */
export const items = sqliteTable(
  'items',
  {
    id: id(),
    kind: text('kind', { enum: ITEM_KINDS }).notNull().default('task'),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    startAt: integer('start_at'),
    endAt: integer('end_at'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    estimatedMinutes: integer('estimated_minutes'),
    dueAt: integer('due_at'),
    /** 1 = urgente ... 4 = baja */
    priority: integer('priority').notNull().default(3),
    category: text('category'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('pending'),
    flexibility: text('flexibility', { enum: FLEXIBILITIES }).notNull().default('rigid'),
    completedAt: integer('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('items_start_idx').on(t.startAt), index('items_status_idx').on(t.status)]
)

/** Regla RRULE (librería rrule) más excepciones (instancias omitidas, en ms UTC). */
export const recurrences = sqliteTable('recurrences', {
  id: id(),
  itemId: text('item_id')
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: 'cascade' }),
  rrule: text('rrule').notNull(),
  /** Zona horaria IANA con la que se interpreta la regla (p. ej. "America/Bogota"). */
  timezone: text('timezone').notNull(),
  exceptions: text('exceptions', { mode: 'json' })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`)
})

export const reminders = sqliteTable('reminders', {
  id: id(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  /** Minutos antes del inicio. */
  offsetMinutes: integer('offset_minutes').notNull(),
  snoozePolicy: text('snooze_policy', { mode: 'json' })
    .$type<{ minutes: number; maxSnoozes: number }>()
    .notNull()
    .default(sql`'{"minutes":10,"maxSnoozes":3}'`)
})

/** Paquete de recursos de un ítem (1:1). Define cómo se abre el conjunto. */
export const resourcePackages = sqliteTable('resource_packages', {
  id: id(),
  itemId: text('item_id')
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: 'cascade' }),
  /** 'auto' abre todo a la hora; 'manual' espera al botón "Iniciar". */
  openMode: text('open_mode', { enum: OPEN_MODES }).notNull().default('auto'),
  /** Retraso por defecto entre recursos (ms). */
  defaultDelayMs: integer('default_delay_ms').notNull().default(0)
})

export const resources = sqliteTable(
  'resources',
  {
    id: id(),
    packageId: text('package_id')
      .notNull()
      .references(() => resourcePackages.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type', { enum: RESOURCE_TYPES }).notNull(),
    /** URL, ruta de archivo, ruta de carpeta o ruta del ejecutable. */
    target: text('target').notNull(),
    args: text('args', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Retraso antes de abrir este recurso (ms); null = usa el del paquete. */
    delayMs: integer('delay_ms')
  },
  (t) => [index('resources_package_idx').on(t.packageId, t.position)]
)

export type AutomationGraph = {
  nodes: unknown[]
  edges: unknown[]
}

export const automations = sqliteTable('automations', {
  id: id(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** Grafo disparador → condiciones → acciones (lo define el editor visual, fase 5). */
  graph: text('graph', { mode: 'json' })
    .$type<AutomationGraph>()
    .notNull()
    .default(sql`'{"nodes":[],"edges":[]}'`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const executionLogs = sqliteTable(
  'execution_logs',
  {
    id: id(),
    automationId: text('automation_id').references(() => automations.id, { onDelete: 'set null' }),
    itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
    actionType: text('action_type').notNull(),
    status: text('status', { enum: ['ok', 'error', 'skipped'] }).notNull(),
    detail: text('detail'),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at')
  },
  (t) => [index('execution_logs_started_idx').on(t.startedAt)]
)

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: id(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status', { enum: ITEM_STATUSES }),
    toStatus: text('to_status', { enum: ITEM_STATUSES }).notNull(),
    at: integer('at').notNull(),
    note: text('note')
  },
  (t) => [index('activity_logs_item_idx').on(t.itemId, t.at)]
)

/** Preferencias, horas de silencio, permisos, lista de permitidos de comandos… */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull()
})

/**
 * Próximos disparos del scheduler, persistidos para sobrevivir a reinicios y suspensiones.
 * Una fila por (recordatorio, ocurrencia). `kind` es texto libre para poder añadir tipos
 * (p. ej. 'start' en la Fase 3) sin migrar.
 */
export const scheduledTriggers = sqliteTable(
  'scheduled_triggers',
  {
    id: id(),
    kind: text('kind').notNull().default('reminder'),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** set null: si se edita el recordatorio, el historial de avisos no se pierde. */
    reminderId: text('reminder_id').references(() => reminders.id, { onDelete: 'set null' }),
    /** Inicio original de la ocurrencia a la que avisa (ms UTC). */
    occurrenceStart: integer('occurrence_start').notNull(),
    fireAt: integer('fire_at').notNull(),
    status: text('status', { enum: TRIGGER_STATUSES }).notNull().default('pending'),
    snoozeCount: integer('snooze_count').notNull().default(0),
    firedAt: integer('fired_at'),
    /** El usuario ya vio este aviso perdido en el resumen. */
    acknowledgedAt: integer('acknowledged_at')
  },
  (t) => [
    uniqueIndex('triggers_unique_idx').on(t.reminderId, t.occurrenceStart),
    index('triggers_due_idx').on(t.status, t.fireAt)
  ]
)
