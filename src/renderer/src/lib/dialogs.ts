// Boîtes de dialogue natives + re-focus de la fenêtre.
//
// Bug Electron connu : après window.confirm()/alert(), la fenêtre garde un
// état de focus corrompu — les champs et listes déroulantes deviennent
// inertes tant qu'on n'a pas cliqué ailleurs. Le contournement officiel est
// de faire blur+focus sur la fenêtre juste après le dialogue.

export function confirmDialog(message: string): boolean {
  const ok = window.confirm(message)
  void window.api.refocus()
  return ok
}

export function alertDialog(message: string): void {
  window.alert(message)
  void window.api.refocus()
}
