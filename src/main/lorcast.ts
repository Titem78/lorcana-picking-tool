// Client Lorcast (port du lorcast.py V1) : une carte n'est demandée qu'une
// seule fois à l'API, tout est mis en cache sur disque (JSON + images AVIF).
// Hors-ligne ou carte inconnue → null, l'app retombe sur les données du PDF.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const API_BASE = 'https://api.lorcast.com/v0'
const USER_AGENT = 'LorcanaPickingTool/2.0 (+local)'
const MISS_TTL_MS = 3600_000 // ne pas marteler l'API pour une carte inconnue

export interface LorcastCard {
  name: string
  version: string | null
  ink: string | null // "Amber", ...
  rarity: string | null // "Common", "Super_rare", ...
  set_code: string
  set_name: string | null
  collector_number: string
  image_small: string | null
  image_normal: string | null
  /** vignette dans le cache images, si téléchargée */
  image_file: string | null
  /** version haute définition (zoom), si téléchargée */
  image_large_file: string | null
}

let cardCache: Record<string, unknown> | null = null
const missCache = new Map<string, number>()

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'cache')
  mkdirSync(join(dir, 'images'), { recursive: true })
  return dir
}

function cacheFile(): string {
  return join(cacheDir(), 'cards.json')
}

function loadCache(): Record<string, unknown> {
  if (cardCache) return cardCache
  try {
    cardCache = JSON.parse(readFileSync(cacheFile(), 'utf-8'))
  } catch {
    cardCache = {}
  }
  return cardCache!
}

function saveCache(): void {
  const tmp = cacheFile() + '.tmp'
  writeFileSync(tmp, JSON.stringify(cardCache ?? {}), 'utf-8')
  renameSync(tmp, cacheFile())
}

function fromApi(d: Record<string, unknown>): Omit<LorcastCard, 'image_file' | 'image_large_file'> {
  const img = ((d.image_uris as Record<string, unknown>)?.digital ?? {}) as Record<string, string>
  const set = (d.set ?? {}) as Record<string, unknown>
  return {
    name: (d.name as string) ?? '',
    version: (d.version as string) ?? null,
    ink: (d.ink as string) ?? null,
    rarity: (d.rarity as string) ?? null,
    set_code: String(set.code ?? ''),
    set_name: (set.name as string) ?? null,
    collector_number: String(d.collector_number ?? ''),
    image_small: img.small ?? null,
    image_normal: img.normal ?? null
  }
}

/** Carte par chapitre + numéro de collection, avec image téléchargée en cache. */
export async function getCard(setCode: string, number: string): Promise<LorcastCard | null> {
  const key = `${setCode}/${number}`
  const cache = loadCache()

  let raw = cache[key] as Record<string, unknown> | undefined
  if (!raw) {
    const lastMiss = missCache.get(key)
    if (lastMiss && Date.now() - lastMiss < MISS_TTL_MS) return null
    try {
      const res = await fetch(`${API_BASE}/cards/${setCode}/${number}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = (await res.json()) as Record<string, unknown>
      cache[key] = raw
      saveCache()
    } catch {
      missCache.set(key, Date.now())
      return null
    }
  }

  const card = fromApi(raw)
  const image_file = await ensureImage(card, 'small')
  const image_large_file = await ensureImage(card, 'large')
  return { ...card, image_file, image_large_file }
}

/**
 * Télécharge (une fois) l'image de la carte, renvoie le nom de fichier local.
 * 'small' = vignette (listes), 'large' = haute définition (zoom plein écran).
 */
async function ensureImage(
  card: Omit<LorcastCard, 'image_file' | 'image_large_file'>,
  size: 'small' | 'large'
): Promise<string | null> {
  const url = size === 'small' ? (card.image_small ?? card.image_normal) : (card.image_normal ?? card.image_small)
  if (!url) return null
  let ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'avif'
  if (!['avif', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) ext = 'avif'
  const fname = `${card.set_code}_${card.collector_number}_${size}.${ext}`.replace(/[^\w.-]/g, '_')
  const local = join(cacheDir(), 'images', fname)
  if (existsSync(local) && statSync(local).size > 0) return fname

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await writeFile(local, Buffer.from(await res.arrayBuffer()))
    return fname
  } catch {
    return null
  }
}

export function imagesDir(): string {
  return join(cacheDir(), 'images')
}
