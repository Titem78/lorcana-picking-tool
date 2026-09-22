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

interface LjIndex {
  fetchedAt: string
  /** « set/num » → URL image officielle (cartes des chapitres) */
  std: Record<string, string>
  /** « P3/6 » (promoGrouping/num) → URL image officielle (promos) */
  promo: Record<string, string>
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
        images?: { full?: string; thumbnail?: string }
      }[]
    }
    const idx: LjIndex = { fetchedAt: new Date().toISOString(), std: {}, promo: {} }
    for (const c of data.cards ?? []) {
      const url = c.images?.full ?? c.images?.thumbnail
      if (!url || c.number == null) continue
      if (c.promoGrouping) {
        idx.promo[`${String(c.promoGrouping).toUpperCase()}/${c.number}`] = url
      } else if (c.setCode != null) {
        idx.std[`${c.setCode}/${c.number}`] = url
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
