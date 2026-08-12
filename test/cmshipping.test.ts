import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ session: { fromPartition: () => ({}) } }))

import { parseShippingFromHtml } from '../src/main/cmshipping'

// Reproduit la page d'une vente NON suivie, AVEC le panneau « Créer un
// modèle » qui contient le libellé piège « Méthode d'envoi & Numéro de
// suivi » AVANT le vrai bloc (bug du 2026-08-12 : 4 envois sur-affranchis).
const PAGE_NON_SUIVIE = `
  <div class="sidebar">
    <h3>Créer un modèle</h3>
    <p>Générer un PDF avec les adresses à imprimer sur une enveloppe.</p>
    <label>En haut à gauche</label><label>En bas à droite</label><label>Aucun</label>
    <select><option>Adresse</option><option>Méthode d'envoi &amp; Numéro de suivi</option></select>
  </div>
  <dt>Méthode d'envoi:</dt>
  <dd><span>Lettre Verte</span> <span>(max. 20g)</span>
    <span>Envoi non suivi | Trustee Service</span> <span>Non</span></dd>
  <dt>Numéro de suivi:</dt>
`

const PAGE_SUIVIE = `
  <select><option>Méthode d'envoi &amp; Numéro de suivi</option></select>
  <dt>Méthode d'envoi:</dt>
  <dd><span>Lettre Verte Suivi</span> <span>(max. 100g)</span>
    <span>Suivi | Trustee Service</span> <span>Oui</span></dd>
`

describe('parseShippingFromHtml', () => {
  it('extrait la dénomination propre malgré le libellé piège du panneau modèle', () => {
    const s = parseShippingFromHtml(PAGE_NON_SUIVIE)
    expect(s).not.toBeNull()
    expect(s!.method).toBe('Lettre Verte')
    expect(s!.max_g).toBe(20)
  })

  it('détecte « Envoi non suivi » explicitement (jamais déduit du nom)', () => {
    expect(parseShippingFromHtml(PAGE_NON_SUIVIE)!.tracked).toBe(false)
  })

  it('détecte le suivi explicite « Suivi | Trustee Service »', () => {
    const s = parseShippingFromHtml(PAGE_SUIVIE)
    expect(s!.method).toBe('Lettre Verte Suivi')
    expect(s!.max_g).toBe(100)
    expect(s!.tracked).toBe(true)
  })

  it('renvoie null si la page ne contient pas le bloc', () => {
    expect(parseShippingFromHtml('<html><body>rien ici</body></html>')).toBeNull()
  })
})
