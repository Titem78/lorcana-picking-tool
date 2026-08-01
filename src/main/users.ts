import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb, logActivity } from './db'
import type { User } from '@shared/types'

// PIN → hash scrypt "salt:hash" (hex). Un PIN 4 chiffres n'est pas un secret
// fort ; l'objectif est la traçabilité entre collègues, pas la cryptographie.
function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 32)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const PUBLIC_FIELDS = 'id, name, is_admin, active, created_at'

export function listUsers(): User[] {
  return getDb()
    .prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE active = 1 ORDER BY name`)
    .all() as User[]
}

export function createUser(name: string, pin: string, isAdmin: boolean): User {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Le nom est obligatoire')
  if (!/^\d{4}$/.test(pin)) throw new Error('Le PIN doit faire 4 chiffres')
  const db = getDb()
  const info = db
    .prepare('INSERT INTO users (name, pin_hash, is_admin) VALUES (?, ?, ?)')
    .run(trimmed, hashPin(pin), isAdmin ? 1 : 0)
  const user = db
    .prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`)
    .get(info.lastInsertRowid) as User
  logActivity(user.id, 'user.created', { name: trimmed })
  return user
}

export function authenticate(userId: number, pin: string): User | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId) as
    | (User & { pin_hash: string })
    | undefined
  if (!row) return null
  if (!verifyPin(pin, row.pin_hash)) {
    logActivity(userId, 'user.pin_failed')
    return null
  }
  logActivity(userId, 'user.login')
  const { pin_hash: _omit, ...pub } = row
  return pub as User
}

export function changePin(userId: number, oldPin: string, newPin: string): void {
  if (!/^\d{4}$/.test(newPin)) throw new Error('Le PIN doit faire 4 chiffres')
  if (!authenticate(userId, oldPin)) throw new Error('PIN actuel incorrect')
  getDb().prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(newPin), userId)
  logActivity(userId, 'user.pin_changed')
}

/** Promotion/rétrogradation admin — réservé aux admins, et on garde toujours au moins un admin. */
export function setAdmin(byUserId: number, targetId: number, isAdmin: boolean): void {
  const db = getDb()
  const by = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(byUserId) as
    | { is_admin: number }
    | undefined
  if (!by?.is_admin) throw new Error('Réservé aux administrateurs')
  if (!isAdmin) {
    const admins = db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND active = 1 AND id != ?')
      .get(targetId) as { n: number }
    if (admins.n === 0) throw new Error('Impossible : il faut au moins un administrateur')
  }
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, targetId)
  logActivity(byUserId, isAdmin ? 'user.promoted' : 'user.demoted', { target: targetId })
}

export function deactivateUser(userId: number, byUserId: number): void {
  getDb().prepare('UPDATE users SET active = 0 WHERE id = ?').run(userId)
  logActivity(byUserId, 'user.deactivated', { target: userId })
}

export function countUsers(): number {
  const r = getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get() as {
    n: number
  }
  return r.n
}
