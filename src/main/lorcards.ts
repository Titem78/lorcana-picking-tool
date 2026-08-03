// Scans FRANÇAIS via LorCards.fr — couvre aussi les chapitres les plus
// récents (vérifié : set 13, Enchanted/Epic compris), là où Dreamborn est en
// retard. Les URLs d'images contiennent le numéro et le chapitre
// (…lorcanacards-<num>-<total>-fr-<set>-<nom>.webp) : on construit un index
// (set/numéro → URL) en parcourant les pages de liste, mis en cache sur
// disque et rafraîchi par la tête de liste (nouveautés) quand il vieillit.

import { app } from 'electron'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
const LIST_BASE = 'https://www.lorcards.fr/cards/liste-cartes-francaises'
const URL_RE = /https:\/\/static\.lorcards\.fr\/cards\/fr\/[^\s"']+?\.webp/g
const SETNUM_RE = /-(\d+)-\d+-fr-(\d+)-/
const STALE_MS = 7 * 24 * 3600_000
const MAX_PAGES = 130

interface LorcardsIndex {
  fullCrawlAt: string | null
  refreshAt: string | null
  map: Record<string, string> // "set/num" -> url
  urls?: string[] // toutes les URLs vues (recherche par nom : promos, etc.)
}

let index: LorcardsIndex | null = null
let crawling: Promise<void> | null = null

function indexFile(): string {
  return join(app.getPath('userData'), 'cache', 'lorcards-fr-index.json')
}

function loadIndex(): LorcardsIndex {
  if (index) return index
  try {
    index = JSON.parse(readFileSync(indexFile(), 'utf-8')) as LorcardsIndex
  } catch {
    index = { fullCrawlAt: null, refreshAt: null, map: {} }
  }
  return index!
}

function saveIndex(): void {
  try {
    writeFileSync(indexFile(), JSON.stringify(index), 'utf-8')
  } catch {
    /* cache seulement */
  }
}

async function fetchPage(page: number): Promise<number> {
  const url = page <= 1 ? LIST_BASE : `${LIST_BASE}/${page}`
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return 0
  const html = await res.text()
  const idx = loadIndex()
  if (!idx.urls) idx.urls = []
  const seen = new Set(idx.urls)
  let added = 0
  for (const m of html.matchAll(URL_RE)) {
    const url = m[0]
    if (!seen.has(url)) {
      seen.add(url)
      idx.urls.push(url)
      added++
    }
    const sn = url.match(SETNUM_RE)
    if (sn) {
      const key = `${parseInt(sn[2], 10)}/${parseInt(sn[1], 10)}`
      if (!idx.map[key]) idx.map[key] = url
    }
  }
  return added
}

/** « La Fée Clochette - Collectionneuse… (V.1) » → la-fee-clochette-collectionneuse… */
export function slugify(name: string): string {
  return name
    .replace(/\(V\.\d+\)/gi, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function crawl(fromPage: number, toPage: number, stopWhenStale: boolean): Promise<void> {
  let stalePages = 0
  for (let p = fromPage; p <= toPage; p++) {
    try {
      const added = await fetchPage(p)
      if (added === 0) {
        stalePages++
        // en mode complet aussi : 3 pages vides/erreur d'affilée = fin de liste
        if (stalePages >= (stopWhenStale ? 2 : 3)) break
      } else {
        stalePages = 0
      }
    } catch {
      break // réseau : on garde ce qu'on a
    }
    await new Promise((r) => setTimeout(r, 250)) // politesse envers le site
  }
  saveIndex()
}

/**
 * Construction/rafraîchissement de l'index en ARRIÈRE-PLAN : ne bloque JAMAIS
 * un import. `onComplete` est appelé quand du neuf est arrivé (pour remettre
 * à jour les visuels des commandes existantes).
 */
export function ensureIndexBackground(onComplete?: () => void): void {
  if (process.env.VITEST || crawling) return
  const idx = loadIndex()
  // Index marqué complet mais visiblement tronqué (interruption réseau) :
  // on relance un passage complet (les pages déjà vues sont dédupliquées).
  if (idx.fullCrawlAt && (idx.urls?.length ?? Object.keys(idx.map).length) < 2000) {
    idx.fullCrawlAt = null
  }
  if (!idx.fullCrawlAt) {
    crawling = crawl(1, MAX_PAGES, false).then(() => {
      idx.fullCrawlAt = new Date().toISOString()
      idx.refreshAt = idx.fullCrawlAt
      saveIndex()
      crawling = null
      onComplete?.()
    })
  } else if (Date.now() - Date.parse(idx.refreshAt ?? idx.fullCrawlAt) > STALE_MS) {
    crawling = crawl(1, 12, true).then(() => {
      idx.refreshAt = new Date().toISOString()
      saveIndex()
      crawling = null
      onComplete?.()
    })
  }
}

/**
 * Scan français LorCards pour set/numéro — téléchargé dans le cache images
 * sous le même nom que Dreamborn ({set}_{num}_fr.webp), null si inconnu.
 */
export async function getLorcardsFrImage(
  setCode: string,
  number: string,
  imagesDir: string
): Promise<string | null> {
  const set = parseInt(setCode, 10)
  const num = parseInt(number, 10)
  if (!set || !num) return null

  const fname = `${set}_${number}_fr.webp`.replace(/[^\w.-]/g, '_')
  const local = join(imagesDir, fname)
  if (existsSync(local) && statSync(local).size > 0) return fname

  // Recherche uniquement dans l'index DÉJÀ construit (jamais bloquant) —
  // la construction tourne en arrière-plan et un rattrapage remettra les
  // visuels FR sur les lignes existantes quand elle aboutit.
  const url = loadIndex().map[`${set}/${num}`]
  if (!url) return null
  return (await downloadToAsync(url, local)) ? fname : null
}

async function downloadToAsync(url: string, local: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return false
    await writeFile(local, Buffer.from(await res.arrayBuffer()))
    return true
  } catch {
    return false
  }
}

/**
 * Recherche par NOM (promos et cartes sans chapitre/numéro standard) :
 * le nom FR est slugifié et comparé aux URLs de l'index ; les URLs « promo »
 * sont préférées quand la carte n'a pas de chapitre.
 */
export async function getLorcardsFrImageByName(
  name: string,
  imagesDir: string
): Promise<string | null> {
  const slug = slugify(name)
  if (slug.length < 8) return null
  const urls = loadIndex().urls ?? []
  const matches = urls.filter((u) => u.includes(slug))
  if (matches.length === 0) return null
  const url = matches.find((u) => u.includes('-promo')) ?? matches[0]
  const fname = `name_${slug.slice(0, 60)}_fr.webp`
  const local = join(imagesDir, fname)
  if (existsSync(local) && statSync(local).size > 0) return fname
  return (await downloadToAsync(url, local)) ? fname : null
}
