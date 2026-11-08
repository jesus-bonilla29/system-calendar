export const ITEM_KINDS = ['task', 'event', 'habit'] as const
export const ITEM_STATUSES = ['pending', 'in_progress', 'done', 'cancelled', 'skipped'] as const
export const FLEXIBILITIES = ['rigid', 'flexible'] as const
export const RESOURCE_TYPES = ['url', 'file', 'folder', 'app'] as const
export const OPEN_MODES = ['auto', 'manual'] as const
/**
 * pending: esperando su hora · fired: avisado, esperando acción · missed: venció sin avisar
 * (suspensión, app cerrada, salto de reloj) · silenced: cayó en horas de silencio
 * started / dismissed: resuelto por el usuario.
 */
export const TRIGGER_STATUSES = [
  'pending',
  'fired',
  'missed',
  'silenced',
  'started',
  'dismissed'
] as const

export type ItemKind = (typeof ITEM_KINDS)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type Flexibility = (typeof FLEXIBILITIES)[number]
