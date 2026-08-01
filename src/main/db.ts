import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { MIGRATIONS } from './migrations'

let db: Database.Database | null = null

export function getDbPath(): string {
  return join(app.getPath('userData'), 'lorcana-picking.db')
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
  }
  return db
}

function migrate(d: Database.Database): void {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`)
  const applied = new Set(
    (d.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version
    )
  )
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1
    if (applied.has(version)) return
    const run = d.transaction(() => {
      d.exec(sql)
      d.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
    })
    run()
  })
}

/** Journalise une action utilisateur (traçabilité). */
export function logActivity(userId: number | null, action: string, details?: unknown): void {
  getDb()
    .prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details === undefined ? null : JSON.stringify(details))
}

export function closeDb(): void {
  db?.close()
  db = null
}
