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
  `,

  // 002 — enrichissement Lorcast des lignes de commande
  `
  ALTER TABLE order_lines ADD COLUMN ink TEXT;
  ALTER TABLE order_lines ADD COLUMN rarity TEXT;
  ALTER TABLE order_lines ADD COLUMN image_file TEXT;
  ALTER TABLE order_lines ADD COLUMN lorcast_name TEXT;
  `,

  // 003 — contrôle en préparation + visuels haute définition
  `
  ALTER TABLE order_lines ADD COLUMN prep_checked INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE order_lines ADD COLUMN image_large_file TEXT;
  `,

  // 004 — sections de produits Cardmarket (cartes, dés, scellé...)
  `
  ALTER TABLE order_lines ADD COLUMN section TEXT NOT NULL DEFAULT 'Lorcana Cartes';
  `,

  // 005 — connecteur Odoo (facture liée à la commande)
  `
  ALTER TABLE orders ADD COLUMN odoo_move_id INTEGER;
  ALTER TABLE orders ADD COLUMN odoo_sent_at TEXT;
  ALTER TABLE orders ADD COLUMN odoo_error TEXT;
  `,

  // 006 — accessoires : association aux articles Odoo (stock) + visuels perso
  `
  CREATE TABLE odoo_product_map (
    line_name TEXT PRIMARY KEY,
    product_id INTEGER NOT NULL,
    product_name TEXT
  );
  CREATE TABLE accessory_images (
    line_name TEXT PRIMARY KEY,
    image_file TEXT NOT NULL
  );
  `,

  // 007 — suivi de l'état des factures Odoo (brouillon/validée + n° comptable)
  `
  ALTER TABLE orders ADD COLUMN odoo_number TEXT;
  ALTER TABLE orders ADD COLUMN odoo_state TEXT;
  `,

  // 008 — timbres La Poste imprimés (planches Mon Timbre en Ligne)
  `
  CREATE TABLE stamp_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    stamp_type TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    imported_by INTEGER REFERENCES users(id)
  );
  CREATE TABLE stamps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL REFERENCES stamp_sheets(id),
    number TEXT NOT NULL UNIQUE,
    stamp_type TEXT NOT NULL,
    page INTEGER NOT NULL,
    sd_x REAL NOT NULL,
    sd_y REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'free',
    used_order_id INTEGER REFERENCES orders(id),
    used_at TEXT,
    used_by INTEGER REFERENCES users(id)
  );
  ALTER TABLE orders ADD COLUMN stamp_number TEXT;
  `,

  // 009 — remboursements (souvent frais de port, ex. remise en main propre)
  `
  ALTER TABLE orders ADD COLUMN refund_amount TEXT;
  ALTER TABLE orders ADD COLUMN refund_reason TEXT;
  `,

  // 010 — inventaire : miroir local du stock Cardmarket
  `
  CREATE TABLE stock_items (
    cm_article_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    number TEXT,
    set_code TEXT,
    color_code TEXT,
    language TEXT,
    condition TEXT,
    is_foil INTEGER NOT NULL DEFAULT 0,
    comment TEXT,
    price TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  `,

  // 011 — suivi demandé par Cardmarket (lu explicitement sur la page de la
  // vente : « Envoi non suivi » / « Suivi | Trustee Service Oui ») —
  // 1 = avec suivi, 0 = sans, NULL = pas encore lu
  `
  ALTER TABLE orders ADD COLUMN cm_tracked INTEGER;
  `,

  // 012 — garde-fou : nb d'échecs de lecture de la page de vente ; à 3, on
  // n'essaie plus jamais automatiquement (l'ouverture manuelle reste possible)
  `
  ALTER TABLE orders ADD COLUMN cm_fetch_attempts INTEGER NOT NULL DEFAULT 0;
  `,

  // 013 — import compta Cardmarket→Odoo : journal des fichiers déjà importés
  // (empreinte SHA-256, 3e barrière anti-doublon de la spec compta)
  `
  CREATE TABLE cmtx_files (
    empreinte TEXT PRIMARY KEY,
    nom TEXT,
    periode TEXT,
    importe_le TEXT,
    nb_lignes INTEGER
  );
  `,

  // 014 — acheteur professionnel (badge « Professionnel » sur la page de la
  // vente) : 1 = pro, 0 = particulier, NULL = pas encore lu
  `
  ALTER TABLE orders ADD COLUMN buyer_pro INTEGER;
  `
]
