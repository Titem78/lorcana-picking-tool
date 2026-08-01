import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Base et cache dans un dossier temporaire : on simule l'app Electron.
const userData = mkdtempSync(join(tmpdir(), 'lorcana-test-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

import { closeDb, getDb } from '../src/main/db'
import { createUser } from '../src/main/users'
import { createLocation, setRules } from '../src/main/locations'
import { importPdfs } from '../src/main/orders'
import { buildPickingList, pickLine } from '../src/main/picking'

const SAMPLE = 'D:\\telechargement\\Vente_#1285561183.pdf'

describe.skipIf(!existsSync(SAMPLE))('import PDF → picking → coche (intégration)', () => {
  let userId: number

  beforeAll(() => {
    userId = createUser('Testeur', '1234', true).id
  })

  afterAll(() => {
    closeDb()
    rmSync(userData, { recursive: true, force: true })
  })

  it('importe la vente et détecte le doublon', async () => {
    const [first] = await importPdfs(userId, [SAMPLE])
    expect(first.status).toBe('ok')
    expect(first.cards).toBe(2)

    const [dup] = await importPdfs(userId, [SAMPLE])
    expect(dup.status).toBe('duplicate')
  })

  it('construit la liste de picking, rangée selon les règles', () => {
    // Emplacement « Deck box SR/L » : super rares et légendaires du chapitre 12.
    const locId = createLocation(userId, {
      name: 'Deck box SR/L',
      kind: 'deckbox',
      color: '#d4a437',
      label: null,
      notes: null
    })
    setRules(userId, locId, [{ rarities: ['Super_rare', 'Legendary'], chapters: [12] }])

    const list = buildPickingList()
    expect(list.order_count).toBe(1)
    expect(list.total_qty).toBe(4)
    expect(list.picked_qty).toBe(0)

    // Les deux cartes (SR + L, chapitre 12) doivent tomber dans la deck box.
    expect(list.sections).toHaveLength(1)
    expect(list.sections[0].location_name).toBe('Deck box SR/L')
    expect(list.sections[0].items).toHaveLength(2)
    // Tri par numéro : 86 avant 90
    expect(list.sections[0].items[0].number).toBe('86')
  })

  it('coche les lignes et fait avancer le statut de la commande', () => {
    const list = buildPickingList()
    const allSublines = list.sections.flatMap((s) => s.items.flatMap((i) => i.sublines))
    expect(allSublines).toHaveLength(2)

    pickLine(userId, allSublines[0].line_id, true)
    let status = getDb().prepare('SELECT status FROM orders').get() as { status: string }
    expect(status.status).toBe('picking')

    pickLine(userId, allSublines[1].line_id, true)
    status = getDb().prepare('SELECT status FROM orders').get() as { status: string }
    expect(status.status).toBe('picked')

    // Traçabilité : la coche porte le nom du préparateur.
    const after = buildPickingList()
    // La commande étant « picked », elle sort de la liste active.
    expect(after.order_count).toBe(0)

    const line = getDb()
      .prepare('SELECT picked_by, picked_at FROM order_lines WHERE id = ?')
      .get(allSublines[0].line_id) as { picked_by: number; picked_at: string }
    expect(line.picked_by).toBe(userId)
    expect(line.picked_at).toBeTruthy()
  })
})
