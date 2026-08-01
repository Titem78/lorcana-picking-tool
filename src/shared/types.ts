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
}

export interface AppInfo {
  version: string
  dbPath: string
}
