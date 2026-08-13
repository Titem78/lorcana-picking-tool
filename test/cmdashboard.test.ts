import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ session: { fromPartition: () => ({}) } }))

import { parseBalance, parsePaidSales, parseUnread } from '../src/main/cmdashboard'

// Extraits calqués sur les pages réelles (navbar du dump, pagination du stock)
const NAVBAR = `<span class="d-sm-none ms-2 text-success">(2.240,90 € )</span>`
const SALES_LIST = `
  ${NAVBAR}
  <span class="total-count">7</span><span> Résultats</span>
  <a href="/fr/Lorcana/Orders/1293615602">Vente</a>
  <a href="/fr/Lorcana/Orders/1293985658">Vente</a>
  <a href="/fr/Lorcana/Orders/1293615602">doublon</a>
`

describe('dashboard — parseurs', () => {
  it('extrait les ventes payées (ids dédupliqués + total)', () => {
    const p = parsePaidSales(SALES_LIST)
    expect(p.ids).toEqual(['1293615602', '1293985658'])
    expect(p.count).toBe(7)
    expect(p.capped).toBe(false)
  })

  it('détecte un compteur plafonné « 300+ »', () => {
    const p = parsePaidSales('<span class="total-count">300+</span>')
    expect(p.count).toBe(300)
    expect(p.capped).toBe(true)
  })

  it('extrait le solde vendeur de la barre', () => {
    expect(parseBalance(NAVBAR)).toBe('2.240,90 €')
  })

  it('messages : marqueurs unread comptés, sinon 0 si la messagerie est reconnue', () => {
    expect(parseUnread('<div class="msg unread"></div><div class="msg unread"></div>')).toBe(2)
    expect(parseUnread('<a href="/fr/Lorcana/Account/Messages/Azrael67">conv lue</a>')).toBe(0)
    expect(parseUnread('<html>page inattendue</html>')).toBeNull()
  })
})
