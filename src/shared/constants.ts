export const ITEM_KINDS = ['task', 'event', 'habit'] as const
export const ITEM_STATUSES = ['pending', 'in_progress', 'done', 'cancelled', 'skipped'] as const
export const FLEXIBILITIES = ['rigid', 'flexible'] as const
export const RESOURCE_TYPES = ['url', 'file', 'folder', 'app'] as const
export const OPEN_MODES = ['auto', 'manual'] as const

export type ItemKind = (typeof ITEM_KINDS)[number]
export type ItemStatus = (typeof ITEM_STATUSES)[number]
export type Flexibility = (typeof FLEXIBILITIES)[number]
