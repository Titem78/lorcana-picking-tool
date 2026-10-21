import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => mkdtempSync(join(tmpdir(), 'lorcana-cmtop-')) }
}))

import { parseClassement } from '../src/main/cmtop'

describe('parseClassement — classements publics Cardmarket (analyse tolérante)', () => {
  it('extrait les liens produit dans l’ordre, dédoublonnés, entités décodées', () => {
    const html = `
      <nav><a href="/fr/Lorcana/Products/Singles">Singles</a></nav>
      <table>
        <tr><td>1</td><td><a href="/fr/Lorcana/Products/Singles/Fabled/Elsa-The-Fifth-Spirit">Elsa - Le cinqui&egrave;me esprit</a></td></tr>
        <tr><td>2</td><td><a href="/fr/Lorcana/Products/Singles/Fabled/Mickey-Mouse-Brave-Little-Tailor?language=2">Mickey Mouse &#39;Brave&#39; <span>✨</span></a></td></tr>
        <tr><td>3</td><td><a href="/fr/Lorcana/Products/Singles/Fabled/Elsa-The-Fifth-Spirit">Elsa - Le cinqui&egrave;me esprit</a></td></tr>
      </table>`
    const rows = parseClassement(html)
    expect(rows.map((r) => r.name)).toEqual([
      'Elsa - Le cinquième esprit',
      "Mickey Mouse 'Brave' ✨" // le HTML interne est aplati en texte
    ])
    expect(rows[0].url).toBe(
      'https://www.cardmarket.com/fr/Lorcana/Products/Singles/Fabled/Elsa-The-Fifth-Spirit'
    )
  })

  it('ignore les liens de catégorie (menu) et les libellés sans lettres', () => {
    const html = `
      <a href="/fr/Lorcana/Products/Singles">Singles</a>
      <a href="/fr/Lorcana/Products/Boosters">Boosters</a>
      <a href="/fr/Lorcana/Products/Singles/Set/Carte-Reelle">Carte réelle</a>
      <a href="/fr/Lorcana/Products/Singles/Set/Autre-Carte">42</a>`
    const rows = parseClassement(html)
    expect(rows.map((r) => r.name)).toEqual(['Carte réelle'])
  })

  it('page inattendue (aucun lien produit) → liste vide, jamais d’erreur', () => {
    expect(parseClassement('<html><body>Maintenance</body></html>')).toEqual([])
  })
})
