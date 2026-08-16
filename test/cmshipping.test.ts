import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ session: { fromPartition: () => ({}) } }))

import { hasConfirmForm, parseBuyerPro, parseCmToken, parseShippingFromHtml } from '../src/main/cmshipping'

// Formulaires RÉELS du dump cm-page-debug (vente #1293615602, 2026-08-12)
const FORMS_REELS = `
<form method="POST" action="/fr/Lorcana/PostGetAction/Shipment_ConfirmShipment" data-confirmation-message="Confirmer l'envoi de cette commande?" onsubmit="return Form.confirmSubmit(this);" class="w-100"><input type="hidden" name="__cmtkn" value="1dba472566263b0428e9dc9930d836596b131fe06d26692e260897e7f2d8f95d" autocomplete="off"><input type="hidden" name="idShipment" value="1293615602"><div class="d-grid"><input type="submit" value="Confirmer l'envoi" class="btn btn-primary my-2 btn-sm"></div></form>
<form method="POST" action="/fr/Lorcana/PostGetAction/Shipment_SetTrackingNumber"><input type="hidden" name="__cmtkn" value="1dba472566263b0428e9dc9930d836596b131fe06d26692e260897e7f2d8f95d" autocomplete="off"><input type="hidden" name="idShipment" value="1293615602"><input type="text" name="trackingNumber" maxlength="40" required="" class="form-control form-control-sm"><input type="submit" value="Fournir numéro de suivi" class="btn my-2 btn-sm btn-outline-primary"></form>
`

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

describe('acheteur professionnel (badge du bloc acheteur, structure réelle)', () => {
  // Extrait réel : le badge Professionnel dans SellerBuyerInfo (vente JadecardTCG)
  const PRO = `<div id="SellerBuyerInfo" class="d-flex"><span class="seller-info">
    <a href="/fr/Lorcana/Users/JadecardTCG">JadecardTCG</a>
    <span class="fonticon-users-professional" aria-label="Professionnel"></span></span></div>`
  const PARTICULIER = `<div id="SellerBuyerInfo" class="d-flex"><span class="seller-info">
    <a href="/fr/Lorcana/Users/Azrael67">Azrael67</a></span></div>`
  // Le badge de NOTRE compte (barre du haut) ne doit pas compter
  const NAVBAR_SEULEMENT = `<div class="vacationStatus"><span class="fonticon-users-professional"></span></div>
    <div id="SellerBuyerInfo"><a href="/fr/Lorcana/Users/Azrael67">Azrael67</a></div>`

  it('détecte le badge pro dans le bloc acheteur', () => {
    expect(parseBuyerPro(PRO)).toBe(true)
  })
  it('particulier = false, page sans bloc = null', () => {
    expect(parseBuyerPro(PARTICULIER)).toBe(false)
    expect(parseBuyerPro('<html>autre page</html>')).toBeNull()
  })
  it('ignore le badge pro de notre propre compte (barre du haut)', () => {
    expect(parseBuyerPro(NAVBAR_SEULEMENT)).toBe(false)
  })
})

describe('validation d’envoi (formulaires réels du dump)', () => {
  it('extrait le jeton __cmtkn', () => {
    expect(parseCmToken(FORMS_REELS)).toBe(
      '1dba472566263b0428e9dc9930d836596b131fe06d26692e260897e7f2d8f95d'
    )
  })

  it('détecte le formulaire « Confirmer l’envoi » (commande pas encore envoyée)', () => {
    expect(hasConfirmForm(FORMS_REELS)).toBe(true)
  })

  it('ne détecte plus le formulaire une fois la commande envoyée', () => {
    expect(hasConfirmForm('<div>Envoyée: 12.08.2026</div>')).toBe(false)
    expect(parseCmToken('<div>pas de formulaire</div>')).toBeNull()
  })
})
