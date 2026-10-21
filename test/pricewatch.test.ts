import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => mkdtempSync(join(tmpdir(), 'lorcana-pw-')) },
  session: { fromPartition: () => ({}) }
}))

import { parseProductPage, euroEnCents } from '../src/main/pricewatch'

// Reproduit la page produit réelle (capture Mushu - Dragon furtif, 22/09)
const PAGE_MUSHU = `
  <h1>Mushu - Dragon furtif</h1>
  <dl>
    <dt>Rareté</dt><dd><span></span></dd>
    <dt>Nombre</dt><dd>97</dd>
    <dt>Edité dans</dt><dd><a>Invasion Épineuse!</a></dd>
    <dt>Articles disponibles</dt><dd>516</dd>
    <dt>De</dt><dd>6,88 €</dd>
    <dt>Tendance des prix</dt><dd>10,73 €</dd>
    <dt>Prix moyen 30 jours</dt><dd>10,22 €</dd>
    <dt>Prix moyen 7 jours</dt><dd>9,85 €</dd>
    <dt>Prix moyen 1 jour</dt><dd>10,21 €</dd>
  </dl>
  <table>
    <tr><td><a href="/fr/Lorcana/Users/Kaidran75">Kaidran75</a></td><td>7,09 €</td><td><span class="item-count">1</span></td></tr>
    <tr><td><a href="/fr/Lorcana/Users/Made4Game">Made4Game</a></td><td>14,00 €</td><td><span class="item-count">1</span></td></tr>
  </table>`

describe('parseProductPage — chiffres de la page produit (captures réelles)', () => {
  it('lit disponibilité, plancher, tendance et moyennes', () => {
    const p = parseProductPage(PAGE_MUSHU, null)
    expect(p.title).toBe('Mushu - Dragon furtif')
    expect(p.available).toBe(516)
    expect(p.from_cents).toBe(688)
    expect(p.trend_cents).toBe(1073)
    expect(p.avg30_cents).toBe(1022)
    expect(p.avg7_cents).toBe(985)
    expect(p.avg1_cents).toBe(1021)
  })

  it('repère NOTRE annonce (prix + quantité) par le pseudo', () => {
    const p = parseProductPage(PAGE_MUSHU, 'Made4Game')
    expect(p.our_price_cents).toBe(1400)
    expect(p.our_qty).toBe(1)
  })

  it('pseudo absent des offres → null, jamais le prix d’un autre vendeur', () => {
    const p = parseProductPage(PAGE_MUSHU, 'AutreVendeur')
    expect(p.our_price_cents).toBeNull()
  })

  it('euroEnCents : formats Cardmarket (dont milliers et insécables)', () => {
    expect(euroEnCents('0,02 €')).toBe(2)
    expect(euroEnCents('2.550,00 €')).toBe(255000)
    expect(euroEnCents('6,88 €')).toBe(688)
    expect(euroEnCents('')).toBeNull()
  })
})
