import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// locations.ts importe db.ts (qui touche Electron) : app factice suffisante,
// ruleMatches est une fonction pure qui n'ouvre jamais la base.
vi.mock('electron', () => ({
  app: { getPath: () => mkdtempSync(join(tmpdir(), 'lorcana-rules-')) }
}))

import { ruleMatches } from '../src/main/locations'
import type { CardFacts } from '../src/shared/types'

const TOUTES_COULEURS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel']

// Promo typique avant enrichissement : pas d'encre connue, pas de chapitre.
const promoSansEncre: CardFacts = {
  color: '',
  rarity: 'Promo',
  chapter: 0,
  is_foil: true,
  language: 'FR'
}

describe('ruleMatches — bug de la boîte rouge Promo (rapport Laure)', () => {
  it('règle Promo avec LES 6 COULEURS cochées = pas de filtre couleur', () => {
    // Le générateur « une box par rareté » enregistrait les 6 encres : une
    // promo sans encre connue (color vide) restait « Sans emplacement ».
    expect(ruleMatches({ colors: TOUTES_COULEURS, rarities: ['Promo'] }, promoSansEncre)).toBe(true)
  })

  it('toutes les raretés cochées = pas de filtre rareté non plus', () => {
    const toutesRaretes = [
      'Common', 'Uncommon', 'Rare', 'Super_rare', 'Epic', 'Legendary', 'Enchanted', 'Promo'
    ]
    expect(
      ruleMatches({ rarities: toutesRaretes }, { ...promoSansEncre, rarity: '' })
    ).toBe(true)
  })

  it('un sous-ensemble de couleurs reste un vrai filtre', () => {
    expect(ruleMatches({ colors: ['Ruby'], rarities: ['Promo'] }, promoSansEncre)).toBe(false)
    expect(
      ruleMatches({ colors: ['Ruby'] }, { ...promoSansEncre, color: 'Ruby', rarity: 'Common' })
    ).toBe(true)
  })

  it('les critères foil et langue continuent de filtrer', () => {
    expect(ruleMatches({ rarities: ['Promo'], foil: false }, promoSansEncre)).toBe(false)
    expect(ruleMatches({ rarities: ['Promo'], foil: true }, promoSansEncre)).toBe(true)
    expect(ruleMatches({ languages: ['EN'] }, promoSansEncre)).toBe(false)
  })

  it('une carte classique matche toujours sa box couleur + chapitre', () => {
    const carte: CardFacts = {
      color: 'Amber',
      rarity: 'Uncommon',
      chapter: 13,
      is_foil: false,
      language: 'FR'
    }
    expect(ruleMatches({ colors: ['Amber'], chapters: [12, 13] }, carte)).toBe(true)
    expect(ruleMatches({ colors: ['Amber'], chapters: [11] }, carte)).toBe(false)
  })
})
