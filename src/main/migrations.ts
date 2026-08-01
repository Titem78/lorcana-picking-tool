// Migrations de schéma : chaque entrée est appliquée une seule fois, dans l'ordre.
// Ne JAMAIS modifier une migration déjà publiée — en ajouter une nouvelle à la suite.

export const MIGRATIONS: string[] = [
  // 001 — socle : utilisateurs, journal, réglages, emplacements, commandes
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    color TEXT,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE location_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0,
    criteria TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL UNIQUE,
    buyer_username TEXT,
    buyer_name TEXT,
    buyer_address TEXT,
    seller TEXT,
    article_count INTEGER,
    item_value TEXT,
    shipping_cost TEXT,
    total TEXT,
    shipping_method TEXT,
    tracking_number TEXT,
    status TEXT NOT NULL DEFAULT 'imported',
    source_pdf TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    imported_by INTEGER REFERENCES users(id),
    prepared_at TEXT,
    prepared_by INTEGER REFERENCES users(id),
    shipped_at TEXT,
    shipped_by INTEGER REFERENCES users(id),
    notes TEXT
  );

  CREATE TABLE order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    name TEXT NOT NULL,
    number TEXT,
    language TEXT,
    condition TEXT,
    set_code TEXT,
    color_code TEXT,
    color_label TEXT,
    rarity_code TEXT,
    price TEXT,
    comment TEXT,
    is_foil INTEGER NOT NULL DEFAULT 0,
    picked_qty INTEGER NOT NULL DEFAULT 0,
    picked_at TEXT,
    picked_by INTEGER REFERENCES users(id)
  );

  CREATE INDEX idx_order_lines_order ON order_lines(order_id);
  CREATE INDEX idx_activity_log_created ON activity_log(created_at);
  `
]
