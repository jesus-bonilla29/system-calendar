import type { ItemKind, ItemStatus } from '@shared/constants'

export const KIND_LABEL: Record<ItemKind, string> = {
  task: 'Tarea',
  event: 'Evento',
  habit: 'Hábito'
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Completada',
  cancelled: 'Cancelada',
  skipped: 'Omitida'
}

export const PRIORITY_LABEL: Record<number, string> = {
  1: 'Urgente',
  2: 'Alta',
  3: 'Media',
  4: 'Baja'
}

export const FLEXIBILITY_LABEL = { rigid: 'Rígido', flexible: 'Flexible' } as const

export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const WEEKDAY_LONG = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo'
]
