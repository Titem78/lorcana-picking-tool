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
const URL_RE = /https:\/\/static\.lorcards\.fr\/cards\/fr\/[^\s"']+?-(\d+)-\d+-fr-(\d+)-[^\s"']*?\.webp/g
const STALE_MS = 7 * 24 * 3600_000
const MAX_PAGES = 130

interface LorcardsIndex {
  fullCrawlAt: string | null
  refreshAt: string | null
  map: Record<string, string> // "set/num" -> url
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
  let added = 0
  for (const m of html.matchAll(URL_RE)) {
    const key = `${parseInt(m[2], 10)}/${parseInt(m[1], 10)}`
    if (!idx.map[key]) {
      idx.map[key] = m[0]
      added++
    }
  }
  return added
}

async function crawl(fromPage: number, toPage: number, stopWhenStale = false): Promise<void> {
  let stalePages = 0
  for (let p = fromPage; p <= toPage; p++) {
    try {
      const added = await fetchPage(p)
      if (added === 0) {
        stalePages++
        if (stopWhenStale && stalePages >= 2) break
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

async function ensureIndex(): Promise<void> {
  if (process.env.VITEST) return // pas de crawl réseau pendant les tests
  const idx = loadIndex()
  if (crawling) return crawling
  if (!idx.fullCrawlAt) {
    crawling = crawl(1, MAX_PAGES).then(() => {
      idx.fullCrawlAt = new Date().toISOString()
      idx.refreshAt = idx.fullCrawlAt
      saveIndex()
      crawling = null
    })
    return crawling
  }
  const last = Date.parse(idx.refreshAt ?? idx.fullCrawlAt)
  if (Date.now() - last > STALE_MS) {
    crawling = crawl(1, 12, true).then(() => {
      idx.refreshAt = new Date().toISOString()
      saveIndex()
      crawling = null
    })
    return crawling
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

  await ensureIndex()
  const url = loadIndex().map[`${set}/${num}`]
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
