import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type AppDb = BetterSQLite3Database<typeof schema>

export interface DbHandle {
  sqlite: Database.Database
  db: AppDb
}

/**
 * Abre (o crea) la base, activa claves foráneas y WAL, y aplica las migraciones pendientes.
 * `file` puede ser ':memory:' (tests).
 */
export function openDatabase(file: string, migrationsFolder: string): DbHandle {
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return { sqlite, db }
}

export function countAppliedMigrations(sqlite: Database.Database): number {
  const row = sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as {
    n: number
  }
  return row.n
}
