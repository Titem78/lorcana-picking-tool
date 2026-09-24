// Images OFFICIELLES françaises via LorcanaJSON (lorcanajson.org) : les
// données et visuels de l'app Ravensburger — haute qualité, tous chapitres,
// PROMOS incluses avec leur set exact (promoGrouping P1…P4, PD1…). Un seul
// JSON (~9 Mo) téléchargé puis réduit en index disque : pas de crawl.
// Source prioritaire des visuels FR ; Dreamborn/LorCards restent en repli.

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const DATA_URL = 'https://lorcanajson.org/files/current/fr/allCards.json'
const UA = 'LorcanaPickingTool/2.0 (+local)'
const STALE_MS = 7 * 24 * 3600_000
const MISS_REFRESH_MS = 3600_000

export interface LjMeta {
  /** rareté canonique de l'app (Common, Super_rare, Promo, Iconic…) —
   *  celle de la carte de BASE du nom dans ce set (plus petit numéro) */
  rarity: string
  /** encre canonique (Amber…) — bi-encre : la PREMIÈRE couleur */
  ink: string
  /** le set contient plusieurs versions du nom AVEC DES RARETÉS DIFFÉRENTES
   *  (base + Enchantée/Iconique…) : un nom Cardmarket « (V.x) » ne peut alors
   *  pas recevoir de rareté. Si toutes les versions partagent la même rareté
   *  (ex. sets promo : tout est « Promo »), il n'y a pas d'ambiguïté. */
  multi: boolean
}

export interface LjIndex {
  fetchedAt: string
  /** version du format des métadonnées (ancien cache → re-téléchargé) */
  metaV?: number
  /** « set/num » → URL image officielle (cartes des chapitres) */
  std: Record<string, string>
  /** « P3/6 » (promoGrouping/num) → URL image officielle (promos) */
  promo: Record<string, string>
  /** « nomNormalisé|set » → métadonnées (set = chapitre ou grouping promo) */
  meta: Record<string, LjMeta>
  /** nom seul (réimpressions : rarity vide si ambiguë, l'encre est sûre) */
  metaByName: Record<string, LjMeta>
}

/** Libellés FRANÇAIS de l'app officielle → canonique de l'app. */
const RARETE_FR: Record<string, string> = {
  Commune: 'Common',
  Inhabituelle: 'Uncommon',
  Rare: 'Rare',
  'Très Rare': 'Super_rare',
  Épique: 'Epic',
  Légendaire: 'Legendary',
  Enchantée: 'Enchanted',
  Spécial: 'Promo',
  Iconique: 'Iconic'
}
const ENCRE_FR: Record<string, string> = {
  Ambre: 'Amber',
  Améthyste: 'Amethyst',
  Émeraude: 'Emerald',
  Rubis: 'Ruby',
  Saphir: 'Sapphire',
  Acier: 'Steel'
}
export function frRarity(r: string | undefined): string {
  return RARETE_FR[r ?? ''] ?? ''
}
export function frInk(c: string | undefined): string {
  // bi-encre « Améthyste-Saphir » : la première couleur fait foi (règle métier)
  return ENCRE_FR[(c ?? '').split('-')[0]] ?? ''
}
/** Nom CM ≈ nom officiel : minuscule, sans accents/(V.x)/ponctuation. */
export function normName(name: string): string {
  return name
    .replace(/\(V\.\d+\)/gi, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

let index: LjIndex | null = null
let loading: Promise<LjIndex | null> | null = null
let lastMissRefresh = 0

function indexFile(): string {
  return join(app.getPath('userData'), 'cache', 'lorcanajson-fr.json')
}

function loadDisk(): LjIndex | null {
  try {
    return JSON.parse(readFileSync(indexFile(), 'utf-8')) as LjIndex
  } catch {
    return null
  }
}

async function download(): Promise<LjIndex | null> {
  try {
    const res = await fetch(DATA_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      cards?: {
        setCode?: string | number
        number?: number
        promoGrouping?: string
        fullName?: string
        rarity?: string
        color?: string
        images?: { full?: string; thumbnail?: string }
      }[]
    }
    const built = buildMetaIndex(data.cards ?? [])
    const idx: LjIndex = {
      fetchedAt: new Date().toISOString(),
      metaV: 3,
      std: {},
      promo: {},
      meta: built.meta,
      metaByName: built.metaByName
    }
    for (const c of data.cards ?? []) {
      const url = c.images?.full ?? c.images?.thumbnail
      if (c.number != null && url) {
        if (c.promoGrouping) {
          idx.promo[`${String(c.promoGrouping).toUpperCase()}/${c.number}`] = url
        } else if (c.setCode != null) {
          idx.std[`${c.setCode}/${c.number}`] = url
        }
      }
    }
    if (!Object.keys(idx.std).length) return null
    try {
      writeFileSync(indexFile(), JSON.stringify(idx), 'utf-8')
    } catch {
      /* cache seulement */
    }
    return idx
  } catch {
    return null
  }
}

async function ensureIndex(forceRefresh = false): Promise<LjIndex | null> {
  if (process.env.VITEST) return null
  if (!index) index = loadDisk()
  // Ancien cache sans les métadonnées (ou format antérieur) : on re-télécharge
  if (index && (!index.meta || index.metaV !== 3)) index = null
  const fresh = index && Date.now() - Date.parse(index.fetchedAt) < STALE_MS
  if (index && fresh && !forceRefresh) return index
  if (!loading) {
    loading = download().then((fetched) => {
      loading = null
      if (fetched) index = fetched
      return index // échec réseau : on garde l'index existant, même vieux
    })
  }
  return index ?? (await loading)
}

export interface LjCardInput {
  setCode?: string | number
  number?: number
  promoGrouping?: string
  fullName?: string
  rarity?: string
  color?: string
}

/**
 * Construit l'index des métadonnées par nom. ⚠ PIÈGE (bug réel signalé) : les
 * versions spéciales (Enchantée, Iconique…) portent le MÊME nom que la carte
 * de base dans le MÊME set — un simple écrasement étiquetait des cartes de
 * base « Iconique ». Règle : la rareté retenue est celle du PLUS PETIT numéro
 * (= la carte de base), et `multi` mémorise que le set contient des raretés
 * DIFFÉRENTES pour ce nom (même rareté partout = pas d'ambiguïté, ex. promos).
 */
export function buildMetaIndex(cards: LjCardInput[]): {
  meta: Record<string, LjMeta>
  metaByName: Record<string, LjMeta>
} {
  const parSet = new Map<
    string,
    { rarity: string; ink: string; number: number; raretes: Set<string> }
  >()
  for (const c of cards) {
    if (!c.fullName) continue
    const nom = normName(c.fullName)
    const setKey = c.promoGrouping ? String(c.promoGrouping).toUpperCase() : String(c.setCode ?? '')
    if (!nom || !setKey) continue
    const key = `${nom}|${setKey}`
    const num = c.number ?? 9999
    const r = frRarity(c.rarity)
    const cur = parSet.get(key)
    if (!cur) {
      parSet.set(key, { rarity: r, ink: frInk(c.color), number: num, raretes: new Set([r]) })
    } else {
      cur.raretes.add(r)
      if (num < cur.number) {
        cur.number = num
        cur.rarity = r
      }
      if (!cur.ink) cur.ink = frInk(c.color)
    }
  }
  const meta: Record<string, LjMeta> = {}
  const metaByName: Record<string, LjMeta> = {}
  for (const [key, v] of parSet) {
    // multi = ambiguïté RÉELLE : des raretés différentes dans le set
    meta[key] = { rarity: v.rarity, ink: v.ink, multi: v.raretes.size > 1 }
    const nom = key.slice(0, key.lastIndexOf('|'))
    const parNom = metaByName[nom]
    if (!parNom) {
      metaByName[nom] = { rarity: v.rarity, ink: v.ink, multi: v.raretes.size > 1 }
    } else {
      // Réimpression dans un autre set : l'encre reste sûre ; la rareté
      // seulement si toutes les bases sont d'accord
      if (parNom.rarity && parNom.rarity !== v.rarity) parNom.rarity = ''
      if (!parNom.ink) parNom.ink = v.ink
      if (v.raretes.size > 1) parNom.multi = true
    }
  }
  return { meta, metaByName }
}

/**
 * Choix des métadonnées pour une carte du STOCK (fonction pure, testée) :
 * set exact d'abord, nom seul en repli. Un nom Cardmarket « (V.x) » désigne
 * une VARIANTE : si le set compte plusieurs versions, la rareté est omise
 * (on ne sait pas laquelle) — l'encre reste valable dans tous les cas.
 */
export function pickMeta(
  idx: Pick<LjIndex, 'meta' | 'metaByName'>,
  name: string,
  setCode: string | null,
  colorCode: string | null
): LjMeta | null {
  const nom = normName(name)
  if (!nom) return null
  const estVariante = /\(V\.\d+\)/i.test(name)
  const setKey = setCode
    ? String(parseInt(setCode, 10) || setCode)
    : colorCode
      ? groupingFor(colorCode)
      : ''
  const m = (setKey ? idx.meta[`${nom}|${setKey}`] : undefined) ?? idx.metaByName[nom]
  if (!m) return null
  if (estVariante && m.multi) return { ...m, rarity: '' }
  return m
}

/** Rareté + encre OFFICIELLES d'une carte du stock (voir pickMeta). */
export async function getCardMetaFr(
  name: string,
  setCode: string | null,
  colorCode: string | null
): Promise<LjMeta | null> {
  const idx = await ensureIndex()
  if (!idx?.meta) return null
  return pickMeta(idx, name, setCode, colorCode)
}

/** Set promo LorcanaJSON pour un code Cardmarket : PR3 → P3, sinon tel quel. */
function groupingFor(promoCode: string): string {
  const c = promoCode.toUpperCase()
  const m = c.match(/^PR(\d)$/)
  return m ? `P${m[1]}` : c
}

/**
 * Visuel officiel FR d'une carte : par chapitre + numéro, ou pour une promo
 * (setCode vide) par code promo Cardmarket + numéro — correspondance EXACTE
 * exigée (même set promo, même numéro), jamais une autre version.
 */
export async function getOfficialFrImage(
  setCode: string,
  number: string,
  promoCode: string | null | undefined,
  imagesDir: string
): Promise<string | null> {
  const num = parseInt(number, 10)
  if (!num) return null
  const set = setCode.replace(/\D/g, '')

  let key: string
  let fname: string
  if (set) {
    key = `${parseInt(set, 10)}/${num}`
    // même nom de fichier que la chaîne FR existante : cache partagé
    fname = `${parseInt(set, 10)}_${number}_fr.webp`.replace(/[^\w.-]/g, '_')
  } else if (promoCode) {
    const g = groupingFor(promoCode)
    key = `${g}/${num}`
    fname = `promo_${g}_${num}_fr.webp`.replace(/[^\w.-]/g, '_')
  } else {
    return null
  }

  const local = join(imagesDir, fname)
  if (existsSync(local) && statSync(local).size > 0) return fname

  let idx = await ensureIndex()
  let url = set ? idx?.std[key] : idx?.promo[key]
  if (!url && idx && Date.now() - lastMissRefresh >= MISS_REFRESH_MS) {
    // carte plus récente que l'index : on retente un téléchargement des données
    lastMissRefresh = Date.now()
    idx = await ensureIndex(true)
    url = set ? idx?.std[key] : idx?.promo[key]
  }
  if (!url) return null

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    await writeFile(local, Buffer.from(await res.arrayBuffer()))
    return fname
  } catch {
    return null
  }
}
