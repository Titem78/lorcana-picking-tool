// Grammage d'une commande : recommandation Cardmarket (le « (max. 100g) » de
// la méthode d'envoi) + estimation locale (cartes × poids/carte + enveloppe),
// calibrable dans Réglages → Général pour coller à la balance du magasin.

export interface WeightSettings {
  envelope_g: number
  card_g: number
}

// Enveloppe à bulles ~15 g, carte Lorcana sous sleeve ~3 g : on arrondit
// au-dessus, mieux vaut sur-affranchir que voir revenir le courrier.
export const DEFAULT_WEIGHT: WeightSettings = { envelope_g: 15, card_g: 3 }

export async function loadWeightSettings(): Promise<WeightSettings> {
  const [env, card] = await Promise.all([
    window.api.settings.get('ship_envelope_g') as Promise<string | null>,
    window.api.settings.get('ship_card_g') as Promise<string | null>
  ])
  return {
    envelope_g: parseFloat(env ?? '') || DEFAULT_WEIGHT.envelope_g,
    card_g: parseFloat(card ?? '') || DEFAULT_WEIGHT.card_g
  }
}

/** Tranches d'affranchissement lettre La Poste. */
const BRACKETS = [20, 100, 250, 500] as const

export interface WeightEstimate {
  grams: number
  bracket: string
}

export function estimateWeight(cardCount: number, s: WeightSettings): WeightEstimate {
  const grams = Math.round(s.envelope_g + cardCount * s.card_g)
  const b = BRACKETS.find((x) => grams <= x)
  return { grams, bracket: b ? `${b} g` : '3 kg' }
}

/** Grammage max annoncé par la méthode d'envoi Cardmarket (ex. « (max. 100g) »). */
export function cmMaxGrams(shippingMethod: string | null | undefined): number | null {
  const m = (shippingMethod ?? '').match(/max\.?\s*(\d+)\s*g/i)
  return m ? parseInt(m[1], 10) : null
}
