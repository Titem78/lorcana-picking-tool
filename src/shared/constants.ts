// Référentiels Lorcana / Cardmarket partagés entre main et renderer.

/** Encres canoniques (mêmes libellés que l'API Lorcast). */
export const INK_COLORS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'] as const

export const INK_LABELS_FR: Record<string, string> = {
  Amber: 'Ambre',
  Amethyst: 'Améthyste',
  Emerald: 'Émeraude',
  Ruby: 'Rubis',
  Sapphire: 'Saphir',
  Steel: 'Acier'
}

export const INK_HEX: Record<string, string> = {
  Amber: '#f4b433',
  Amethyst: '#8a4ea6',
  Emerald: '#33a457',
  Ruby: '#d3323f',
  Sapphire: '#3488c5',
  Steel: '#8b98a5'
}

// NB : dans les PDF Cardmarket, « 12WIL » = chapitre 12 + abréviation du NOM
// du chapitre (WIL = Wilds Unknown, FAB = Fabled, WHI = Whispers in the Well…).
// Ce n'est PAS un code couleur — l'encre vient exclusivement de Lorcast.

/** Raretés canoniques (mêmes valeurs que Lorcast). */
export const RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Super_rare',
  'Epic',
  'Legendary',
  'Enchanted',
  'Promo'
] as const

export const RARITY_LABELS_FR: Record<string, string> = {
  Common: 'Commune',
  Uncommon: 'Inhabituelle',
  Rare: 'Rare',
  Super_rare: 'Super rare',
  Epic: 'Epic',
  Legendary: 'Légendaire',
  Enchanted: 'Enchantée',
  Promo: 'Promo'
}

/** Codes rareté des PDF Cardmarket → canonique. (La rareté Lorcast, obtenue
 * par numéro de collection, fait foi quand elle est disponible.) */
export const CM_RARITY_CODE_TO_RARITY: Record<string, string> = {
  C: 'Common',
  U: 'Uncommon',
  R: 'Rare',
  SR: 'Super_rare',
  EP: 'Epic',
  L: 'Legendary',
  E: 'Enchanted',
  P: 'Promo'
}

export const LOCATION_KINDS = [
  { id: 'box_color', label: 'Boîte de couleur' },
  { id: 'box_numbered', label: 'Boîte numérotée' },
  { id: 'binder', label: 'Classeur' },
  { id: 'deckbox', label: 'Deck box' },
  { id: 'other', label: 'Autre' }
] as const

export const LANGUAGES = ['FR', 'EN', 'DE', 'IT', 'ES'] as const
