import type { AgendaApi } from '@shared/ipc'

declare global {
  interface Window {
    api: AgendaApi
  }
}
