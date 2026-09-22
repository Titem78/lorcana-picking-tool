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
      'https://static.lorcards.fr/cards/fr/lorcanacards-23-224-fr-10-mickey-mouse-champion-ambre.webp'
    ]
  })
)

import { findSetNumByName } from '../src/main/lorcards'

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
