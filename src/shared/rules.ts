import type { RuleCriteria } from './types'
import { INK_LABELS_FR, RARITY_LABELS_FR } from './constants'

/** « 1-5, 8, 10 » → [1,2,3,4,5,8,10]. Entrée vide → []. */
export function parseChaptersInput(text: string): number[] {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = part.match(/^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/)
    if (!m) continue
    let a = parseInt(m[1], 10)
    let b = m[2] ? parseInt(m[2], 10) : a
    if (b < a) [a, b] = [b, a]
    for (let n = a; n <= b; n++) out.add(n)
  }
  return [...out].sort((x, y) => x - y)
}

/** [1,2,3,5,7,8] → « 1-3, 5, 7-8 » */
export function compactIntRanges(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  const runs: [number, number][] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n
    } else {
      runs.push([start, prev])
      start = prev = n
    }
  }
  runs.push([start, prev])
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')
}

/** Résumé lisible d'une règle, pour l'UI. */
export function describeCriteria(c: RuleCriteria): string {
  const bits: string[] = []
  if (c.colors?.length) bits.push('Encres : ' + c.colors.map((x) => INK_LABELS_FR[x] ?? x).join(', '))
  if (c.rarities?.length)
    bits.push('Raretés : ' + c.rarities.map((x) => RARITY_LABELS_FR[x] ?? x).join(', '))
  if (c.chapters?.length) bits.push('Chapitres : ' + compactIntRanges(c.chapters))
  if (c.foil === true) bits.push('Foil uniquement')
  if (c.foil === false) bits.push('Non-foil uniquement')
  if (c.languages?.length) bits.push('Langues : ' + c.languages.join(', '))
  return bits.length ? bits.join('  •  ') : 'Toutes les cartes'
}
