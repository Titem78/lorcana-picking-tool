// Lien de vérification du suivi selon le mode d'envoi Cardmarket.

const CARRIERS: { match: RegExp; url: (n: string) => string; label: string }[] = [
  {
    match: /mondial\s*relay/i,
    label: 'Mondial Relay',
    url: (n) => `https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=${encodeURIComponent(n)}`
  },
  {
    match: /chronopost/i,
    label: 'Chronopost',
    url: (n) =>
      `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(n)}`
  },
  {
    // Lettre Verte Suivi, Lettre Suivie, Colissimo, La Poste — le défaut français
    match: /lettre|colissimo|poste|suivi/i,
    label: 'La Poste',
    url: (n) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(n)}`
  }
]

export function trackingInfo(
  shippingMethod: string | null,
  trackingNumber: string | null
): { label: string; url: string } | null {
  if (!trackingNumber?.trim()) return null
  const method = shippingMethod ?? ''
  const carrier = CARRIERS.find((c) => c.match.test(method)) ?? CARRIERS[CARRIERS.length - 1]
  return { label: carrier.label, url: carrier.url(trackingNumber.trim()) }
}
