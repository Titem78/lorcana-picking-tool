// Types partagés entre le processus principal (main) et l'interface (renderer).

export interface User {
  id: number
  name: string
  is_admin: number
  active: number
  created_at: string
}

export interface ActivityEntry {
  id: number
  user_id: number | null
  user_name: string | null
  action: string
  details: string | null
  created_at: string
}

export type LocationKind = 'box_color' | 'box_numbered' | 'binder' | 'deckbox' | 'other'

export interface StorageLocation {
  id: number
  name: string
  kind: LocationKind
  color: string | null
  label: string | null
  sort_order: number
  notes: string | null
  active: number
  created_at: string
  rules: LocationRule[]
}

/** Critères d'une règle de rangement. Un champ absent/vide = « tous ». Logique ET. */
export interface RuleCriteria {
  chapters?: number[] // ex. [1, 2, 3, 10]
  colors?: string[] // encres canoniques, ex. ["Ruby", "Sapphire"]
  rarities?: string[] // canoniques, ex. ["Common", "Legendary"]
  foil?: boolean | null // true = uniquement foil, false = uniquement non-foil, null = peu importe
  languages?: string[] // ex. ["FR", "EN"]
}

/** Faits d'une carte évalués par le moteur de règles. */
export interface CardFacts {
  color: string // encre canonique, ex. "Amber"
  rarity: string // rareté canonique, ex. "Legendary"
  chapter: number
  is_foil: boolean
  language: string
}

export interface LocationRule {
  id: number
  location_id: number
  priority: number
  criteria: RuleCriteria
}

export type OrderStatus = 'imported' | 'picking' | 'picked' | 'prepared' | 'shipped' | 'archived'

export interface Order {
  id: number
  sale_id: string
  buyer_username: string | null
  buyer_name: string | null
  buyer_address: string | null
  seller: string | null
  article_count: number | null
  item_value: string | null
  shipping_cost: string | null
  total: string | null
  shipping_method: string | null
  tracking_number: string | null
  status: OrderStatus
  source_pdf: string | null
  imported_at: string
  imported_by: number | null
  prepared_at: string | null
  prepared_by: number | null
  shipped_at: string | null
  shipped_by: number | null
  notes: string | null
  // connecteur Odoo
  odoo_move_id: number | null
  odoo_sent_at: string | null
  odoo_error: string | null
  odoo_number: string | null // n° comptable (FACT/2026/0042), attribué à la validation
  odoo_state: string | null // draft | posted | cancel
  stamp_number: string | null // n° du timbre La Poste affecté (SD)
  refund_amount: string | null // remboursement (ex. frais de port), « 3,44 EUR »
  refund_reason: string | null
  // noms joints pour l'affichage (traçabilité)
  imported_by_name?: string | null
  prepared_by_name?: string | null
  shipped_by_name?: string | null
}

export interface OrderLine {
  id: number
  order_id: number
  quantity: number
  name: string
  number: string | null
  language: string | null
  condition: string | null
  set_code: string | null
  color_code: string | null
  color_label: string | null
  rarity_code: string | null
  price: string | null
  comment: string | null
  is_foil: number
  picked_qty: number
  picked_at: string | null
  picked_by: number | null
  // Enrichissement Lorcast (null si hors-ligne à l'import)
  ink: string | null
  rarity: string | null
  image_file: string | null
  image_large_file: string | null
  lorcast_name: string | null
  prep_checked: number
  section: string
  picked_by_name?: string | null
}

// --- Liste de picking ----------------------------------------------------------

export interface PickingSubline {
  line_id: number
  order_id: number
  sale_id: string
  buyer_username: string
  quantity: number
  condition: string | null
  comment: string | null
  price: string | null
  picked_qty: number
  picked_by_name: string | null
  picked_at: string | null
}

export interface PickingItem {
  key: string
  name: string
  section: string
  lorcast_name: string | null
  number: string | null
  set_code: string | null
  ink: string
  rarity: string
  is_foil: boolean
  language: string
  image_file: string | null
  image_large_file: string | null
  total_qty: number
  picked_qty: number
  sublines: PickingSubline[]
}

export interface PickingSection {
  location_id: number | null // null = « Non assigné »
  location_name: string
  location_color: string | null
  location_label: string | null
  items: PickingItem[]
}

export interface PickingList {
  sections: PickingSection[]
  total_qty: number
  picked_qty: number
  order_count: number
}

/** Résultat de l'import d'un PDF. */
export interface ImportResult {
  file: string
  status: 'ok' | 'duplicate' | 'error'
  sale_id?: string
  buyer_username?: string
  cards?: number
  message?: string
  order_id?: number
}

export interface AppInfo {
  version: string
  dbPath: string
}
