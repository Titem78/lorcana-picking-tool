// Classements PUBLICS Cardmarket (section /Lorcana/Data/) : « Weekly Top
// Cards » (meilleures ventes de la semaine, tout le marché) et « Best
// Bargains » (meilleures offres du moment). Pages HTML derrière Cloudflare →
// lues via cmFetch (canal navigateur), UNE fois par semaine, cache disque.
// Analyse tolérante : si la page change, on sauvegarde un dump de débogage
// et on affiche l'ancien classement plutôt que de casser quoi que ce soit.

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDb } from './db'
import { normName } from './lorcanajson'

const TOP_URL = 'https://www.cardmarket.com/fr/Lorcana/Data/Weekly-Top-Cards'
const BARGAINS_URL = 'https://www.cardmarket.com/fr/Lorcana/Data/Best-Bargains'
const STALE_MS = 7 * 24 * 3600_000 // classement hebdomadaire

export interface ClassementRow {
  rank: number
  name: string
  url: string
  /** présent dans TON stock listé ou tes produits traqués */
  possede: boolean
}

interface ClassementsDisque {
  fetchedAt: string
  top: { name: string; url: string }[]
  bargains: { name: string; url: string }[]
}

export interface Classements {
  fetchedAt: string
  top: ClassementRow[]
  bargains: ClassementRow[]
  erreur: string | null
}

function fichier(nom: string): string {
  const dir = join(app.getPath('userData'), 'cache')
  mkdirSync(dir, { recursive: true })
  return join(dir, nom)
}

const ENTITES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
  ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', uuml: 'ü', icirc: 'î',
  iuml: 'ï', oelig: 'œ', OElig: 'Œ', hellip: '…', rsquo: '’', lsquo: '‘'
}

function decodeEntites(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (tout, nom: string) => ENTITES[nom] ?? ENTITES[nom.toLowerCase()] ?? tout)
    .replace(/ /g, ' ')
}

/**
 * Extrait les cartes d'une page de classement : tous les liens produit
 * (/xx/Lorcana/Products/…) dans l'ordre de la page, dédoublonnés. Volontairement
 * tolérant — aucune hypothèse sur la mise en page (tableau, cartes, slider…).
 */
export function parseClassement(html: string): { name: string; url: string }[] {
  const rows: { name: string; url: string }[] = []
  const vus = new Set<string>()
  const re = /<a[^>]+href="(\/[a-z]{2}\/Lorcana\/Products\/[^"#?]+)[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && rows.length < 60) {
    const url = m[1]
    // catégories du menu (…/Products/Singles sans slug de carte) : ignorées
    const segments = url.split('/').filter(Boolean)
    if (segments.length < 5) continue
    const name = decodeEntites(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (name.length < 3 || !/[a-zà-ÿ]/i.test(name)) continue
    if (vus.has(url)) continue
    vus.add(url)
    rows.push({ name, url: `https://www.cardmarket.com${url}` })
  }
  return rows
}

/** noms normalisés de TOUT ce qu'on possède : stock listé + produits traqués. */
function nomsPossedes(): Set<string> {
  const s = new Set<string>()
  try {
    const db = getDb()
    for (const r of db.prepare('SELECT DISTINCT name FROM stock_items').all() as { name: string }[]) {
      s.add(normName(r.name))
    }
    for (const r of db.prepare('SELECT label FROM price_watch WHERE active = 1').all() as { label: string }[]) {
      s.add(normName(r.label))
    }
  } catch {
    /* base indisponible : pas de badge, jamais bloquant */
  }
  return s
}

function marque(rows: { name: string; url: string }[], possedes: Set<string>): ClassementRow[] {
  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    url: r.url,
    possede: possedes.has(normName(r.name))
  }))
}

let enCours: Promise<Classements | null> | null = null

/** Classements officiels, rafraîchis au plus 1×/semaine (cache disque). */
export async function getClassements(force = false): Promise<Classements | null> {
  if (process.env.VITEST) return null
  if (enCours) return enCours
  enCours = (async () => {
    try {
      let disque: ClassementsDisque | null = null
      try {
        disque = JSON.parse(readFileSync(fichier('cm-classements.json'), 'utf-8'))
      } catch {
        disque = null
      }
      const frais = disque && Date.now() - Date.parse(disque.fetchedAt) < STALE_MS
      if (disque && frais && !force) {
        const p = nomsPossedes()
        return { fetchedAt: disque.fetchedAt, top: marque(disque.top, p), bargains: marque(disque.bargains, p), erreur: null }
      }
      const { cmFetch } = await import('./cmshipping')
      let erreur: string | null = null
      const litPage = async (url: string, dump: string): Promise<{ name: string; url: string }[] | null> => {
        const r = await cmFetch(url).catch(() => null)
        if (!r || r.status !== 200) {
          erreur = `Page inaccessible (HTTP ${r?.status ?? '—'})`
          return null
        }
        const rows = parseClassement(r.text)
        if (rows.length === 0) {
          // structure inattendue : dump auto pour calibrer, sans rien casser
          try {
            const dir = join(app.getPath('userData'), 'debug')
            mkdirSync(dir, { recursive: true })
            writeFileSync(join(dir, dump), r.text, 'utf-8')
          } catch {
            /* le dump est un confort, jamais bloquant */
          }
          erreur = 'Structure de page inattendue (dump de débogage enregistré)'
          return null
        }
        return rows
      }
      const top = await litPage(TOP_URL, 'cm-top-cards-dump.html')
      const bargains = await litPage(BARGAINS_URL, 'cm-best-bargains-dump.html')
      if (top || bargains) {
        const neuf: ClassementsDisque = {
          fetchedAt: new Date().toISOString(),
          top: top ?? disque?.top ?? [],
          bargains: bargains ?? disque?.bargains ?? []
        }
        writeFileSync(fichier('cm-classements.json'), JSON.stringify(neuf), 'utf-8')
        const p = nomsPossedes()
        return { fetchedAt: neuf.fetchedAt, top: marque(neuf.top, p), bargains: marque(neuf.bargains, p), erreur }
      }
      if (disque) {
        // échec réseau : on sert l'ancien classement plutôt que rien
        const p = nomsPossedes()
        return { fetchedAt: disque.fetchedAt, top: marque(disque.top, p), bargains: marque(disque.bargains, p), erreur }
      }
      return { fetchedAt: '', top: [], bargains: [], erreur: erreur ?? 'Classements indisponibles' }
    } finally {
      enCours = null
    }
  })()
  return enCours
}
