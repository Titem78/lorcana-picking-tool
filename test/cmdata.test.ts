import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => mkdtempSync(join(tmpdir(), 'lorcana-cmdata-')) }
}))

import { scanOpportunites, type GuideRow, type ProduitRow } from '../src/main/cmdata'

const produit = (id: number, name: string): ProduitRow => ({
  idProduct: id,
  name,
  idExpansion: 1,
  dateAdded: '2026-01-01'
})
const ligne = (id: number, p: Partial<GuideRow>): GuideRow => ({
  idProduct: id,
  avg: null,
  low: null,
  trend: null,
  avg1: null,
  avg7: null,
  avg30: null,
  'avg-foil': null,
  'low-foil': null,
  'trend-foil': null,
  'avg1-foil': null,
  'avg7-foil': null,
  'avg30-foil': null,
  ...p
})

describe('scanOpportunites — logique de détection (spec utilisateur)', () => {
  const data = {
    guide: [
      // ACHAT : avg1 bien sous la tendance (vendeurs sous le marché)
      ligne(1, { trend: 1000, avg1: 600, avg7: 900, low: 550 }),
      // BULLE : avg1 s'emballe (+50 % vs tendance)
      ligne(2, { trend: 1000, avg1: 1500, avg7: 1100, low: 900 }),
      // RAS : avg1 ≈ tendance
      ligne(3, { trend: 1000, avg1: 980, avg7: 990, low: 900 }),
      // écarté : pas de ventes 7 j (marché mort)
      ligne(4, { trend: 1000, avg1: 500, avg7: null, low: 400 }),
      // écarté : tendance sous le plancher d'analyse
      ligne(5, { trend: 50, avg1: 10, avg7: 40, low: 5 }),
      // FOIL : bulle sur la version foil uniquement
      ligne(6, { trend: 900, avg1: 910, avg7: 905, 'trend-foil': 2000, 'avg1-foil': 3000, 'avg7-foil': 2200, 'low-foil': 1800 })
    ],
    produits: new Map([
      [1, produit(1, 'Carte Achat')],
      [2, produit(2, 'Carte Bulle')],
      [3, produit(3, 'Carte Calme')],
      [4, produit(4, 'Carte Morte')],
      [5, produit(5, 'Carte Vrac')],
      [6, produit(6, 'Carte Foil Chaude')]
    ])
  }

  it('repère les achats sous-évalués avec le % d’écart', () => {
    const { achats } = scanOpportunites(data)
    expect(achats.map((a) => a.name)).toEqual(['Carte Achat'])
    expect(Math.round(achats[0].ecart_pct)).toBe(40) // (1000−600)/1000
  })

  it('repère les bulles (dont les foils, signalées ✨)', () => {
    const { bulles } = scanOpportunites(data)
    expect(bulles.map((b) => `${b.name}${b.foil ? ' foil' : ''}`)).toEqual([
      'Carte Bulle',
      'Carte Foil Chaude foil'
    ])
    expect(Math.round(bulles[0].ecart_pct)).toBe(50)
  })

  it('ignore les marchés morts (avg7 absent) et le vrac sous le plancher', () => {
    const { achats, bulles } = scanOpportunites(data)
    const noms = [...achats, ...bulles].map((x) => x.name)
    expect(noms).not.toContain('Carte Morte')
    expect(noms).not.toContain('Carte Vrac')
    expect(noms).not.toContain('Carte Calme')
  })
})
