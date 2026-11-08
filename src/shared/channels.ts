/** Lista de canales IPC permitidos. Sin dependencias: el preload (sandbox) solo puede importar esto. */
export const ipcChannels = [
  'app:ping',
  'app:dbInfo',
  'items:create',
  'items:get',
  'items:update',
  'items:delete',
  'items:setStatus',
  'items:skipOccurrence',
  'items:listRange',
  'items:listUnscheduled'
] as const
