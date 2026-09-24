import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Index LorCards factice sur disque : on simule l'app Electron.
const userData = mkdtempSync(join(tmpdir(), 'lorcana-lorcards-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

mkdirSync(join(userData, 'cache'), { recursive: true })
writeFileSync(
  join(userData, 'cache', 'lorcards-fr-index.json'),
  JSON.stringify({
    fullCrawlAt: '2026-09-01T00:00:00Z',
    refreshAt: '2026-09-01T00:00:00Z',
    map: {},
    urls: [
      // URL standard : porte numéro (48), total (204) et chapitre (5)
      'https://static.lorcards.fr/cards/fr/lorcanacards-48-204-fr-5-elsa-le-cinquieme-esprit.webp',
      // URL promo : pas de set/numéro exploitable
      'https://static.lorcards.fr/cards/fr/lorcanacards-promo-fr-mickey-mouse-le-vrai-heros.webp',
      'https://static.lorcards.fr/cards/fr/lorcanacards-23-224-fr-10-mickey-mouse-champion-ambre.webp',
      // DEUX versions promo du même nom (cas réel signalé par l'utilisateur) :
      'https://static.lorcards.fr/cards/fr/p3/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-6-p3-fr-13-promo-set-13-elsa-le-cinquieme-esprit.webp',
      'https://static.lorcards.fr/cards/fr/dis/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-7-dis-fr-13-promo-set-13-elsa-le-cinquieme-esprit.webp',
      // Une seule version promo :
      'https://static.lorcards.fr/cards/fr/pd1/image-cartes-a-collectionner-lorcana-disney-game-tcg-lorcanacards-5-pd1-fr-13-promo-set-13-buzz-leclair-assure-la-couverture.webp'
    ]
  })
)

mkdirSync(join(userData, 'cache', 'images'), { recursive: true })

import { findSetNumByName, getLorcardsFrImageByName } from '../src/main/lorcards'
import { getOfficialFrImage, frRarity, frInk, normName } from '../src/main/lorcanajson'

describe('findSetNumByName — encre des promos DIS/D23 par le nom FR', () => {
  it("retrouve le chapitre et numéro d'origine depuis le nom du PDF", () => {
    expect(findSetNumByName('Elsa - Le cinquième esprit')).toEqual({ set: '5', num: '48' })
    expect(findSetNumByName('Mickey Mouse - Champion Ambre')).toEqual({ set: '10', num: '23' })
  })

  it('ignore les URLs promo sans set/numéro et les noms inconnus', () => {
    expect(findSetNumByName('Mickey Mouse - Le vrai héros')).toBeNull()
    expect(findSetNumByName('Carte Inconnue - Version fantôme')).toBeNull()
  })

  it('refuse les noms trop courts (matchs ambigus)', () => {
    expect(findSetNumByName('Elsa')).toBeNull()
  })
})

describe('getLorcardsFrImageByName — jamais le visuel d’une AUTRE version promo', () => {
  const images = join(userData, 'cache', 'images')
  // Visuels « déjà téléchargés » : la fonction rend le nom sans réseau
  writeFileSync(join(images, 'name_elsa-le-cinquieme-esprit_dis7_fr.webp'), 'x')
  writeFileSync(join(images, 'name_elsa-le-cinquieme-esprit_p36_fr.webp'), 'x')
  writeFileSync(join(images, 'name_buzz-leclair-assure-la-couverture_pd15_fr.webp'), 'x')

  it('choisit la version du MÊME set promo que Cardmarket', async () => {
    expect(await getLorcardsFrImageByName('Elsa - Le cinquième esprit', images, 'DIS', '7')).toBe(
      'name_elsa-le-cinquieme-esprit_dis7_fr.webp'
    )
    expect(await getLorcardsFrImageByName('Elsa - Le cinquième esprit', images, 'PR3', '6')).toBe(
      'name_elsa-le-cinquieme-esprit_p36_fr.webp'
    )
  })

  it('set promo introuvable → AUCUN visuel plutôt qu’un visuel trompeur', async () => {
    expect(
      await getLorcardsFrImageByName('Elsa - Le cinquième esprit', images, 'D23', '9')
    ).toBeNull()
  })

  it('sans code : refuse si plusieurs versions promo existent', async () => {
    expect(await getLorcardsFrImageByName('Elsa - Le cinquième esprit', images)).toBeNull()
  })

  it('sans code : accepte si une seule version promo existe', async () => {
    expect(await getLorcardsFrImageByName('Buzz l’Éclair - Assure la couverture', images)).toBe(
      'name_buzz-leclair-assure-la-couverture_pd15_fr.webp'
    )
  })
})

describe('getOfficialFrImage — visuels officiels LorcanaJSON', () => {
  const images = join(userData, 'cache', 'images')
  writeFileSync(join(images, 'promo_P3_6_fr.webp'), 'x')
  writeFileSync(join(images, '5_48_fr.webp'), 'x')

  it('promo Cardmarket PR3 n°6 → set promo officiel P3/6 (cache)', async () => {
    expect(await getOfficialFrImage('', '6', 'PR3', images)).toBe('promo_P3_6_fr.webp')
  })

  it('carte de chapitre : même nom de cache que la chaîne FR existante', async () => {
    expect(await getOfficialFrImage('5', '48', null, images)).toBe('5_48_fr.webp')
  })

  it('promo sans code, ou numéro invalide → null (pas de réseau en test)', async () => {
    expect(await getOfficialFrImage('', '6', null, images)).toBeNull()
    expect(await getOfficialFrImage('', 'abc', 'PR3', images)).toBeNull()
  })
})

describe('conversions LorcanaJSON (libellés FR officiels → canonique app)', () => {
  it('raretés (dont Très Rare → Super_rare, Spécial → Promo, Iconique)', () => {
    expect(frRarity('Commune')).toBe('Common')
    expect(frRarity('Inhabituelle')).toBe('Uncommon')
    expect(frRarity('Très Rare')).toBe('Super_rare')
    expect(frRarity('Spécial')).toBe('Promo')
    expect(frRarity('Iconique')).toBe('Iconic')
    expect(frRarity('Enchantée')).toBe('Enchanted')
    expect(frRarity(undefined)).toBe('')
  })

  it('encres, bi-encre = première couleur (règle métier)', () => {
    expect(frInk('Ambre')).toBe('Amber')
    expect(frInk('Améthyste-Saphir')).toBe('Amethyst')
    expect(frInk('')).toBe('')
  })

  it('normName rapproche les noms CM des noms officiels', () => {
    expect(normName('Buzz l’Éclair - Assure la couverture')).toBe(
      normName("Buzz l'Éclair - Assure la couverture")
    )
    expect(normName('Elsa - Le cinquième esprit (V.1)')).toBe(normName('Elsa - Le cinquième esprit'))
  })
})

describe('buildMetaIndex / pickMeta — variantes Iconique/Enchantée (bug signalé)', async () => {
  const { buildMetaIndex, pickMeta } = await import('../src/main/lorcanajson')
  // Set 10 : Hadès existe en BASE (n°68, Légendaire) et en ICONIQUE (n°223)
  const idx = buildMetaIndex([
    { fullName: 'Hadès - Cherchant un accord', setCode: '10', number: 68, rarity: 'Légendaire', color: 'Améthyste' },
    { fullName: 'Hadès - Cherchant un accord', setCode: '10', number: 223, rarity: 'Iconique', color: 'Améthyste' },
    { fullName: 'Mushu - Dragon furtif', setCode: '13', number: 97, rarity: 'Rare', color: 'Émeraude' },
    // Réimpression du même nom dans deux sets avec la même rareté
    { fullName: 'Mushu - Dragon furtif', setCode: 'D23', number: 4, rarity: 'Rare', color: 'Émeraude', promoGrouping: 'D23' }
  ])

  it('la carte de base garde SA rareté (jamais celle de la variante)', () => {
    expect(pickMeta(idx, 'Hadès - Cherchant un accord', '10', null)?.rarity).toBe('Legendary')
  })

  it('un nom (V.x) dans un set multi-versions : rareté omise, encre conservée', () => {
    const m = pickMeta(idx, 'Hadès - Cherchant un accord (V.1)', '10', null)
    expect(m?.rarity).toBe('')
    expect(m?.ink).toBe('Amethyst')
  })

  it('un nom (V.x) dans un set à version unique garde sa rareté', () => {
    expect(pickMeta(idx, 'Mushu - Dragon furtif (V.1)', '13', null)?.rarity).toBe('Rare')
  })

  it('repli par nom seul : rareté des bases si unanimes', () => {
    expect(pickMeta(idx, 'Mushu - Dragon furtif', '', '')?.rarity).toBe('Rare')
    expect(pickMeta(idx, 'Carte Inconnue', '', '')).toBeNull()
  })
})

describe('variantes de MÊME rareté (Raiponce P4 n°15/16, toutes deux Promo)', async () => {
  const { buildMetaIndex, pickMeta } = await import('../src/main/lorcanajson')
  const idx = buildMetaIndex([
    { fullName: 'Raiponce - S’échappe de la tour', promoGrouping: 'P4', number: 15, rarity: 'Spécial', color: 'Émeraude' },
    { fullName: 'Raiponce - S’échappe de la tour', promoGrouping: 'P4', number: 16, rarity: 'Spécial', color: 'Émeraude' }
  ])
  it('un (V.x) reçoit la rareté quand toutes les versions du set la partagent', () => {
    expect(pickMeta(idx, 'Raiponce - S’échappe de la tour (V.1)', '', 'PR4')?.rarity).toBe('Promo')
    expect(pickMeta(idx, 'Raiponce - S’échappe de la tour (V.2)', '', 'PR4')?.rarity).toBe('Promo')
  })
})
