import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { parseCardmarketPdf } from '../src/main/pdf-parser'
import { parseChaptersInput, compactIntRanges } from '../src/shared/rules'

// PDF réel non versionné (données personnelles) : le test se saute s'il est absent.
const SAMPLE = 'D:\\telechargement\\Vente_#1285561183.pdf'

describe.skipIf(!existsSync(SAMPLE))('parseCardmarketPdf — Vente #1285561183', () => {
  // NB : pas de valeurs nominatives (nom, adresse, n° de suivi) dans les
  // assertions — le dépôt est public. On vérifie la structure extraite.
  it('extrait l’en-tête complet', async () => {
    const order = await parseCardmarketPdf(SAMPLE)
    expect(order.sale_id).toBe('1285561183')
    expect(order.buyer_username).toMatch(/^\S+$/)
    expect(order.buyer_name.split(' ').length).toBeGreaterThanOrEqual(2)
    // adresse : rue \n code postal + ville \n pays
    const addr = order.buyer_address.split('\n')
    expect(addr.length).toBeGreaterThanOrEqual(3)
    expect(addr[addr.length - 2]).toMatch(/^\d{5} /)
    expect(addr[addr.length - 1]).toBe('France')
    expect(order.seller).toBe('Made4Game')
    expect(order.sent_date).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
    expect(order.article_count).toBe(4)
    expect(order.item_value).toBe('5,20 EUR')
    expect(order.shipping_cost).toBe('2,52 EUR')
    expect(order.total).toBe('7,72 EUR')
    expect(order.shipping_method).toBe('Lettre Verte Suivi')
    expect(order.tracking_number).toMatch(/^[0-9A-Z]{10,}$/)
  })

  it('extrait les lignes de cartes', async () => {
    const order = await parseCardmarketPdf(SAMPLE)
    expect(order.cards).toHaveLength(2)

    const [elinor, reine] = order.cards
    expect(elinor.quantity).toBe(1)
    expect(elinor.name).toBe('Elinor - Diplomate renommée')
    expect(elinor.number).toBe('86')
    expect(elinor.language).toBe('FR')
    expect(elinor.condition).toBe('NM')
    expect(elinor.set_code).toBe('12')
    expect(elinor.color_code).toBe('WIL')
    expect(elinor.rarity_code).toBe('SR')
    expect(elinor.price).toBe('0,70 EUR')
    expect(elinor.is_foil).toBe(false)

    expect(reine.quantity).toBe(3)
    expect(reine.name).toBe('La Reine - Déguisement sournois')
    expect(reine.number).toBe('90')
    expect(reine.rarity_code).toBe('L')
    expect(reine.comment).toBe('Booster to sleeve')
    expect(reine.price).toBe('1,50 EUR')

    // Total des quantités = « Contenu : 4 articles »
    const totalQty = order.cards.reduce((s, c) => s + c.quantity, 0)
    expect(totalQty).toBe(order.article_count)
  })
})

describe('helpers règles', () => {
  it('parseChaptersInput', () => {
    expect(parseChaptersInput('1-5, 8, 10')).toEqual([1, 2, 3, 4, 5, 8, 10])
    expect(parseChaptersInput('')).toEqual([])
    expect(parseChaptersInput('5-3')).toEqual([3, 4, 5])
  })
  it('compactIntRanges', () => {
    expect(compactIntRanges([1, 2, 3, 5, 7, 8])).toBe('1-3, 5, 7-8')
    expect(compactIntRanges([])).toBe('')
  })
})
