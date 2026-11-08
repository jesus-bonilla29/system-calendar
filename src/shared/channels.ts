/** Lista de canales IPC permitidos. Sin dependencias: el preload (sandbox) solo puede importar esto. */
export const ipcChannels = ['app:ping', 'app:dbInfo'] as const
