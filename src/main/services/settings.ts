import { eq } from 'drizzle-orm'
import type { AppDb } from '../db'
import { settings } from '../db/schema'

export interface QuietHours {
  enabled: boolean
  /** HH:mm local */
  start: string
  end: string
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, start: '23:00', end: '07:00' }

/** Preferencias clave/valor persistidas en la tabla `settings`. */
export class SettingsService {
  constructor(private readonly db: AppDb) {}

  get<T>(key: string, fallback: T): T {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get()
    return row ? (row.value as T) : fallback
  }

  set(key: string, value: unknown): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run()
  }
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** ¿El instante cae en horas de silencio? Admite rangos que cruzan la medianoche (23:00–07:00). */
export function isQuietAt(cfg: QuietHours, instant: number): boolean {
  if (!cfg.enabled) return false
  const d = new Date(instant)
  const minutes = d.getHours() * 60 + d.getMinutes()
  const start = toMinutes(cfg.start)
  const end = toMinutes(cfg.end)
  if (start === end) return false
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}
