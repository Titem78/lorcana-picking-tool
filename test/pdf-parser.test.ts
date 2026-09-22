import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { parseCardmarketPdf, parseCardText, lorcastSetForLine } from '../src/main/pdf-parser'

// PDF réel non versionné : vente #1297835152 (108 articles dont 3 promos PR2/PR3)
const SAMPLE_PROMOS = 'D:\\telechargement\\Vente_#1297835152.pdf'

describe('parseCardText — cartes promo (bug des 105/108)', () => {
  it('accepte les codes de set promo PR2/PR3 (lettres puis chiffre)', () => {
    const c = parseCardText('1 Aladdin - Protecteur vigilant 29 FR NM PR2 P Foil 1,00 EUR', 'Lorcana Cartes')
    expect(c).not.toBeNull()
    expect(c!.set_code).toBe('')
    expect(c!.color_code).toBe('PR2')
    expect(c!.number).toBe('29')
    expect(c!.is_foil).toBe(true)
  })

  it('accepte les codes promo tout en lettres (DIS = Discover Promo)', () => {
    const c = parseCardText('1 Stitch - Découvreur 5 FR NM DIS P 0,50 EUR', 'Lorcana Cartes')
    expect(c).not.toBeNull()
    expect(c!.set_code).toBe('')
    expect(c!.color_code).toBe('DIS')
  })

  it('ne confond jamais un état ou une langue avec un code de set', () => {
    // « NM » en position de set = ligne malformée → rejetée, pas importée de travers
    expect(parseCardText('1 Carte bizarre 5 FR NM NM P 0,50 EUR', 'Lorcana Cartes')).toBeNull()
  })

  it('les lignes classiques restent inchangées', () => {
    const c = parseCardText('3 La Reine - Déguisement sournois 90 FR NM 12WIL L Booster to sleeve 1,50 EUR', 'Lorcana Cartes')
    expect(c!.set_code).toBe('12')
    expect(c!.color_code).toBe('WIL')
    expect(c!.rarity_code).toBe('L')
  })
})

describe('lorcastSetForLine — set Lorcast interrogeable (promos comprises)', () => {
  it('un chapitre normal passe tel quel', () => {
    expect(lorcastSetForLine('12', 'WIL')).toBe('12')
    expect(lorcastSetForLine('13', 'ATT')).toBe('13')
  })

  it('convertit les codes promo Cardmarket vers Lorcast (PR2 → P2)', () => {
    expect(lorcastSetForLine('', 'PR2')).toBe('P2')
    expect(lorcastSetForLine('', 'PR3')).toBe('P3')
  })

  it('refuse les codes promo à numérotation Cardmarket propre (DIS, D23…)', () => {
    // Le « DIS » Cardmarket ≠ le set « DIS » Lorcast (vérifié : Buzz
    // « Assure la couverture » = DIS/8 côté CM mais PD1/5 côté Lorcast) —
    // un lookup direct enrichirait la mauvaise carte. Encre par NOM à la place.
    expect(lorcastSetForLine('', 'DIS')).toBe('')
    expect(lorcastSetForLine('', 'D23')).toBe('')
    expect(lorcastSetForLine('', 'NM')).toBe('')
    expect(lorcastSetForLine('', '')).toBe('')
    expect(lorcastSetForLine(null, null)).toBe('')
  })
})

describe.skipIf(!existsSync(SAMPLE_PROMOS))('parseCardmarketPdf — Vente #1297835152 (promos)', () => {
  it('importe les 108 articles annoncés, promos comprises', async () => {
    const p = await parseCardmarketPdf(SAMPLE_PROMOS)
    expect(p.article_count).toBe(108)
    expect(p.cards.reduce((s, c) => s + c.quantity, 0)).toBe(108)
    expect(p.cards.filter((c) => /^PR\d$/.test(c.color_code)).length).toBe(3)
  })
})
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

// PDF réel d'une commande d'accessoires (section « Dés: », sans numéros de carte)
const DICE_SAMPLE = 'D:\\telechargement\\Vente_#1290778586.pdf'

describe.skipIf(!existsSync(DICE_SAMPLE))('parseCardmarketPdf — commande de dés', () => {
  it('extrait les lignes de la section Dés', async () => {
    const order = await parseCardmarketPdf(DICE_SAMPLE)
    expect(order.sale_id).toBe('1290778586')
    expect(order.cards.length).toBeGreaterThanOrEqual(6)
    for (const line of order.cards) {
      expect(line.section).toBe('Dés')
      expect(line.quantity).toBeGreaterThan(0)
      expect(line.name).toMatch(/Dés/i)
      expect(line.set_code).toMatch(/^\d+$/)
      expect(line.price).toMatch(/EUR$/)
      expect(line.number).toBe('') // les dés n'ont pas de numéro de collection
    }
    const total = order.cards.reduce((s, c) => s + c.quantity, 0)
    expect(total).toBe(order.article_count)
  })
})

// Autre PDF de vente réel : contrôle d'exhaustivité générique
const SAMPLE3 = 'D:\\telechargement\\Vente_#1283342140.pdf'

describe.skipIf(!existsSync(SAMPLE3))('parseCardmarketPdf — Vente #1283342140', () => {
  it('importe toutes les lignes annoncées', async () => {
    const order = await parseCardmarketPdf(SAMPLE3)
    expect(order.sale_id).toBe('1283342140')
    expect(order.cards.length).toBeGreaterThan(0)
    const totalQty = order.cards.reduce((s, c) => s + c.quantity, 0)
    expect(totalQty).toBe(order.article_count)
    for (const c of order.cards) {
      expect(c.price).toMatch(/EUR$/)
      expect(c.set_code).toMatch(/^\d+$/)
    }
  })
})

// Planche de timbres La Poste réelle (numéros non versionnés : dépôt public)
const STAMP_SHEET = 'D:\\telechargement\\Z0134948232-mtel.pdf'

describe.skipIf(!existsSync(STAMP_SHEET))('parseSheet — planche de timbres', () => {
  it('extrait les 15 timbres avec type, numéro unique et position', async () => {
    const { parseSheet } = await import('../src/main/stamps')
    const stamps = await parseSheet(STAMP_SHEET)
    expect(stamps).toHaveLength(15)
    const numbers = new Set(stamps.map((s) => s.number))
    expect(numbers.size).toBe(15)
    for (const s of stamps) {
      expect(s.number).toMatch(/^[0-9A-Z]{10,}$/)
      expect(s.stamp_type).toMatch(/Lettre verte/i)
      expect(s.page).toBe(1)
      expect(s.sd_x).toBeGreaterThan(100)
      expect(s.sd_y).toBeGreaterThan(100)
    }
    // 3 colonnes distinctes
    const cols = new Set(stamps.map((s) => Math.round(s.sd_x / 10)))
    expect(cols.size).toBe(3)
  })
})

describe('slugify (recherche LorCards par nom)', () => {
  it('normalise les noms FR comme les URLs LorCards', async () => {
    const { slugify } = await import('../src/main/lorcards')
    expect(slugify('La Fée Clochette - Collectionneuse de flocons de neige (V.1)')).toBe(
      'la-fee-clochette-collectionneuse-de-flocons-de-neige'
    )
    expect(slugify("Raiponce - S'échappe de la tour")).toBe('raiponce-s-echappe-de-la-tour')
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
