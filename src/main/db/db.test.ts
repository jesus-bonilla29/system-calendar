import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countAppliedMigrations, openDatabase } from './index'
import { items, resourcePackages, resources } from './schema'
import { eq } from 'drizzle-orm'

const migrations = join(process.cwd(), 'drizzle')

describe('base de datos', () => {
  it('aplica las migraciones en una base vacía', () => {
    const { sqlite } = openDatabase(':memory:', migrations)
    expect(countAppliedMigrations(sqlite)).toBeGreaterThanOrEqual(1)
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of [
      'items',
      'recurrences',
      'reminders',
      'resource_packages',
      'resources',
      'automations',
      'execution_logs',
      'activity_logs',
      'settings'
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('aplica valores por defecto y guarda los campos del planificador', () => {
    const { db } = openDatabase(':memory:', migrations)
    db.insert(items).values({ id: 'a', title: 'Estudiar' }).run()
    const row = db.select().from(items).where(eq(items.id, 'a')).get()
    expect(row).toMatchObject({
      status: 'pending',
      flexibility: 'rigid',
      priority: 3,
      kind: 'task'
    })
    expect(row?.estimatedMinutes).toBeNull()
    expect(row?.dueAt).toBeNull()
  })

  it('el paquete por defecto abre los recursos automáticamente', () => {
    const { db } = openDatabase(':memory:', migrations)
    db.insert(items).values({ id: 'a', title: 'Estudiar' }).run()
    db.insert(resourcePackages).values({ id: 'p', itemId: 'a' }).run()
    expect(db.select().from(resourcePackages).get()?.openMode).toBe('auto')
  })

  it('borrar un ítem borra en cascada su paquete y recursos', () => {
    const { db } = openDatabase(':memory:', migrations)
    db.insert(items).values({ id: 'a', title: 'Estudiar' }).run()
    db.insert(resourcePackages).values({ id: 'p', itemId: 'a' }).run()
    db.insert(resources)
      .values({ id: 'r', packageId: 'p', position: 0, type: 'url', target: 'https://example.com' })
      .run()
    db.delete(items).where(eq(items.id, 'a')).run()
    expect(db.select().from(resources).all()).toHaveLength(0)
  })

  it('rechaza un recurso huérfano (claves foráneas activas)', () => {
    const { db } = openDatabase(':memory:', migrations)
    expect(() =>
      db
        .insert(resources)
        .values({ id: 'r', packageId: 'nope', position: 0, type: 'url', target: 'x' })
        .run()
    ).toThrow()
  })
})
