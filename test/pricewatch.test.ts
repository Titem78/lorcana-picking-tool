import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => mkdtempSync(join(tmpdir(), 'lorcana-pw-')) },
  session: { fromPartition: () => ({}) }
}))

import { parseProductPage, euroEnCents, extractIdProduct, parseMesOffres } from '../src/main/pricewatch'

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

describe('extractIdProduct — identifiant produit depuis la page (lien export quotidien)', () => {
  it('lit la forme JSON embarquée ("idProduct":12345)', () => {
    expect(extractIdProduct('<script>var x = {"idProduct": 839434, "n": 1}</script>')).toBe(839434)
  })

  it('lit le champ de formulaire caché', () => {
    expect(extractIdProduct('<input type="hidden" name="idProduct" value="4521">')).toBe(4521)
  })

  it('lit le paramètre d’URL en dernier recours', () => {
    expect(extractIdProduct('<a href="/x?idProduct=777888&foo=1">lien</a>')).toBe(777888)
  })

  it('page sans identifiant → null (jamais deviné)', () => {
    expect(extractIdProduct('<html><body>rien ici</body></html>')).toBeNull()
  })
})

describe('parseMesOffres — NOTRE annonce sur NOTRE page « Mes offres » (cas réel Buzz 2 250 € invisible sur la page produit)', () => {
  const HTML = `
    <div class="row">
      <a href="/fr/Lorcana/Products/Singles/Wilds-Unknown/Buzz-Lightyear-Jungle-Ranger-V1">Buzz l’Éclair - Ranger de la jungle (V.1)</a>
      <span class="price-container">145,00 €</span><span class="item-count">2</span>
    </div>
    <div class="row">
      <a href="/fr/Lorcana/Products/Singles/Wilds-Unknown/Buzz-Lightyear-Jungle-Ranger-V2?language=2">Buzz l’Éclair - Ranger de la jungle (V.2)</a>
      <span title="Foil"><svg class="icon-foil"></svg></span>
      <span class="price-container">2.250,00 €</span><span class="item-count">1</span>
    </div>`

  it('trouve la ligne par le LIEN EXACT du produit (V.2), jamais par nom', () => {
    const offres = parseMesOffres(HTML, 'Buzz-Lightyear-Jungle-Ranger-V2')
    expect(offres).toEqual([{ price_cents: 225000, qty: 1, foil: true }])
  })

  it('la V.1 ne remonte JAMAIS la ligne V.2 (et inversement)', () => {
    const offres = parseMesOffres(HTML, 'Buzz-Lightyear-Jungle-Ranger-V1')
    expect(offres).toEqual([{ price_cents: 14500, qty: 2, foil: false }])
  })

  it('aucune annonce de ce produit → liste vide, jamais deviné', () => {
    expect(parseMesOffres(HTML, 'Mickey-Mouse-Best-in-Town-V2')).toEqual([])
    expect(parseMesOffres('<html>Maintenance</html>', 'Buzz-Lightyear-Jungle-Ranger-V2')).toEqual([])
  })

  it('foil lu sur data-bs-title aussi (HTML fetché, piège Bootstrap connu)', () => {
    const h = HTML.replace('title="Foil"><svg class="icon-foil">', 'data-bs-title="Version Foil"><svg>')
    expect(parseMesOffres(h, 'Buzz-Lightyear-Jungle-Ranger-V2')[0].foil).toBe(true)
  })
})
