// Import mensuel des transactions Cardmarket vers Odoo (compte 517) —
// portage TypeScript du moteur Python livré par l'utilisateur (spec compta
// dans le zip files-project, INTEGRATION.md). Règles inchangées :
//   - Sales / Purchases / Refunds for shipments / Withdrawals / Cardmarket
//     refunds : une ligne account.bank.statement.line chacun
//   - Commissions + Commission Refunds + Trustee service fees : UNE ligne
//     « Frais Cardmarket MM/AAAA » datée du dernier jour du mois
//   - classement sur la colonne Type (jamais Category, pas fiable)
//   - chaîne des soldes vérifiée ligne à ligne, type inconnu = arrêt
//   - anti-doublon : unique_import_id Odoo + clé de frais par période +
//     empreinte SHA-256 du fichier (journal local, migration 013)
// Récupération auto SANS Playwright : la session persist:cardmarket suffit
// (mêmes 3 requêtes : POST génération, poll Téléchargements, POST fichier).

import { createHash } from 'crypto'
import { getDb, logActivity } from './db'

export class Anomalie extends Error {}

// --- Configuration (défauts = config.json livré, relevé du 16/08/2026) --------

export interface TypeRule {
  actif: boolean
  inverser_signe: boolean
  individuel: boolean
}

export interface CmTxConfig {
  colonnes: Record<string, string>
  types: Record<string, TypeRule>
  gabarit_libelle: string
  gabarit_libelle_sans_tiers: string
  tiers_ignores: string[]
  agregation_frais: { actif: boolean; libelle: string; cle: string }
  site: {
    base: string
    page_details: string
    page_telechargements: string
    action_generer: string
    action_telecharger: string
    id_devise: string
    format: string
    attente_max_s: number
    intervalle_s: number
  }
}

export const DEFAULT_CMTX_CONFIG: CmTxConfig = {
  colonnes: {
    date: 'Date',
    id: 'Transaction',
    categorie: 'Category',
    type: 'Type',
    tiers: 'Counterpart',
    reference: 'Reference',
    montant: 'Amount',
    solde_debut: 'Starting balance (EUR)',
    solde_fin: 'Closing balance (EUR)'
  },
  types: {
    Sales: { actif: true, inverser_signe: false, individuel: true },
    Purchases: { actif: true, inverser_signe: false, individuel: true },
    'Refunds for shipments': { actif: true, inverser_signe: false, individuel: true },
    Withdrawals: { actif: true, inverser_signe: false, individuel: true },
    'Cardmarket refunds': { actif: true, inverser_signe: false, individuel: true },
    Commissions: { actif: true, inverser_signe: false, individuel: false },
    'Commission Refunds': { actif: true, inverser_signe: false, individuel: false },
    'Trustee service fees': { actif: true, inverser_signe: false, individuel: false }
  },
  gabarit_libelle: '{type} - {tiers} - {ref}',
  gabarit_libelle_sans_tiers: '{type} - {ref}',
  tiers_ignores: ['Cardmarket', '-', ''],
  agregation_frais: {
    actif: true,
    libelle: 'Frais Cardmarket {mm_aaaa}',
    cle: 'cardmarket:frais:{periode}'
  },
  site: {
    base: 'https://www.cardmarket.com',
    page_details: '/fr/Lorcana/Account/Transactions/Details',
    page_telechargements: '/fr/Lorcana/Account/Downloads',
    action_generer: '/fr/Lorcana/PostGetAction/Reports_Asynchronous_ExportTransactions',
    action_telecharger: '/fr/Lorcana/PostGetAction/User_Reporting_DownloadReportFileFromAws',
    id_devise: '1',
    format: 'csv',
    attente_max_s: 180,
    intervalle_s: 5
  }
}

export function getCmTxConfig(): CmTxConfig {
  // Surcharge possible via la clé settings 'cmtx_config' (JSON partiel)
  try {
    const r = getDb().prepare("SELECT value FROM settings WHERE key = 'cmtx_config'").get() as
      | { value: string }
      | undefined
    if (r?.value) return { ...DEFAULT_CMTX_CONFIG, ...(JSON.parse(r.value) as Partial<CmTxConfig>) }
  } catch {
    /* défauts */
  }
  return DEFAULT_CMTX_CONFIG
}

// --- Conversions ----------------------------------------------------------------

/** « 97,52 € » / « -1.234,56 » / « -1234.56 » → nombre. Jamais de texte. */
export function enNombre(txt: unknown): number {
  let t = String(txt ?? '0').replace(/[^\d,.\-]/g, '')
  if (t.includes(',') && t.includes('.')) {
    t =
      t.lastIndexOf(',') > t.lastIndexOf('.')
        ? t.replace(/\./g, '').replace(/,/g, '.')
        : t.replace(/,/g, '')
  } else {
    t = t.replace(/,/g, '.')
  }
  // Number (strict) et non parseFloat : « 12-34 » doit lever, pas donner 12
  const v = Number(t || '0')
  if (Number.isNaN(v)) throw new Anomalie(`montant illisible : ${JSON.stringify(txt)}`)
  return Math.round(v * 100) / 100
}

/** « 30.06.2026 16:13:47 » → « 2026-06-30 ». Vraie date ISO, pas du texte. */
export function enDate(txt: unknown): string {
  const t = String(txt ?? '').trim()
  let m = t.match(/^(\d{2})[./](\d{2})[./](\d{4})(\s|$)/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(\s|$)/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  throw new Anomalie(`date illisible : ${JSON.stringify(txt)}`)
}

/** Dernier jour du mois d'une période « AAAA-MM » → « AAAA-MM-JJ ». */
export function finDeMois(periode: string): string {
  const [an, mois] = [parseInt(periode.slice(0, 4), 10), parseInt(periode.slice(5, 7), 10)]
  const last = new Date(an, mois, 0).getDate()
  return `${periode}-${String(last).padStart(2, '0')}`
}

// --- Lecture de l'export (CSV Cardmarket : UTF-8 BOM, séparateur ;) ------------

/** Mini-parseur CSV avec guillemets (le csv.reader de la version Python). */
export function parseCsv(text: string, delim = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

export interface Mouvement {
  id: string
  date: string
  periode: string
  type: string
  tiers: string
  ref: string
  montant: number
  individuel: boolean
}

export interface LectureResult {
  mvts: Mouvement[]
  soldes: { debut: number; fin: number }
}

/**
 * Lit le contenu CSV du Transaction Summary. Le fichier porte sa propre
 * preuve : chaque ligne repart du solde de la précédente — une rupture
 * signifie fichier tronqué ou mal lu, et on n'importe rien.
 */
export function lireExport(contenu: string, cfg: CmTxConfig = DEFAULT_CMTX_CONFIG): LectureResult {
  const lignes = parseCsv(contenu)
  if (lignes.length === 0) throw new Anomalie("l'export ne contient aucun mouvement")
  const entetes = lignes[0].map((x) => x.trim())
  const brut = lignes.slice(1)

  const c = cfg.colonnes
  const absentes = Object.values(c).filter((n) => !entetes.includes(n))
  if (absentes.length > 0) {
    throw new Anomalie(
      `colonnes absentes : ${absentes.join(', ')}.\n` +
        `Colonnes trouvées : ${entetes.join(', ') || '(aucune)'}.\n` +
        `Ce fichier est peut-être le bilan par catégorie et non le détail des ` +
        `transactions : il faut passer par « Montrer toutes les transactions ».`
    )
  }
  const col = Object.fromEntries(Object.values(c).map((n) => [n, entetes.indexOf(n)]))
  if (brut.length === 0) throw new Anomalie("l'export ne contient aucun mouvement")

  let precedent: number | null = null
  brut.forEach((r, i) => {
    const deb = enNombre(r[col[c.solde_debut]])
    const mt = enNombre(r[col[c.montant]])
    const fin = enNombre(r[col[c.solde_fin]])
    if (Math.abs(deb + mt - fin) > 0.005) {
      throw new Anomalie(`ligne ${i + 2} : solde incohérent (${deb} ${mt >= 0 ? '+' : ''}${mt} donne ${fin})`)
    }
    if (precedent !== null && Math.abs(precedent - deb) > 0.005) {
      throw new Anomalie(
        `ligne ${i + 2} : rupture dans la chaîne des soldes (attendu ${precedent}, lu ${deb}) — fichier incomplet ?`
      )
    }
    precedent = fin
  })

  const ignores = new Set<string>()
  const mvts: Mouvement[] = []
  for (const r of brut) {
    const typ = String(r[col[c.type]] ?? '').trim()
    const regle = cfg.types[typ]
    if (regle === undefined) {
      ignores.add(typ)
      continue
    }
    if (!regle.actif) continue
    const d = enDate(r[col[c.date]])
    const tiers = String(r[col[c.tiers]] ?? '').trim()
    mvts.push({
      id: String(r[col[c.id]] ?? '').split('.')[0],
      date: d,
      periode: d.slice(0, 7),
      type: typ,
      tiers: cfg.tiers_ignores.includes(tiers) ? '' : tiers,
      ref: String(r[col[c.reference]] ?? '').split('.')[0],
      montant: Math.round(enNombre(r[col[c.montant]]) * (regle.inverser_signe ? -1 : 1) * 100) / 100,
      individuel: regle.individuel
    })
  }

  if (ignores.size > 0) {
    throw new Anomalie(
      `type(s) de mouvement inconnu(s) : ${[...ignores].sort().join(', ')}.\n` +
        `À déclarer dans la configuration (types) avant d'importer : individuel=true ` +
        `pour une ligne par mouvement, false pour le fondre dans la ligne de frais du mois.\n` +
        `Sans cela le solde du 517 serait faux sans que personne ne le voie.`
    )
  }

  return {
    mvts,
    soldes: {
      debut: enNombre(brut[0][col[c.solde_debut]]),
      fin: enNombre(brut[brut.length - 1][col[c.solde_fin]])
    }
  }
}

// --- Mise en forme : lignes individuelles + agrégat de frais --------------------

export interface LigneOdoo {
  cle: string
  date: string
  libelle: string
  ref: string
  tiers: string
  montant: number
  type: string
  sources: string[]
  detail?: Record<string, number>
}

function libelle(m: Mouvement, cfg: CmTxConfig): string {
  const g = m.tiers ? cfg.gabarit_libelle : cfg.gabarit_libelle_sans_tiers
  return g
    .replace('{type}', m.type)
    .replace('{tiers}', m.tiers)
    .replace('{ref}', m.ref)
    .replace(/^[\s-]+|[\s-]+$/g, '')
}

export function repartitionPeriodes(mvts: Mouvement[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const m of mvts) r[m.periode] = (r[m.periode] ?? 0) + 1
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))
}

export function preparer(
  mvts: Mouvement[],
  periode: string,
  cfg: CmTxConfig = DEFAULT_CMTX_CONFIG
): LigneOdoo[] {
  const duMois = mvts.filter((m) => m.periode === periode)
  if (duMois.length === 0) {
    const dispo = repartitionPeriodes(mvts)
    throw new Anomalie(
      `aucun mouvement sur ${periode} dans ce fichier.\nCe fichier contient : ` +
        Object.entries(dispo)
          .map(([p, n]) => `${p} (${n} mouvements)`)
          .join(', ')
    )
  }

  const lignes: LigneOdoo[] = []
  const frais: Mouvement[] = []
  for (const m of duMois) {
    if (m.individuel || !cfg.agregation_frais.actif) {
      lignes.push({
        cle: `cardmarket:${m.id}`,
        date: m.date,
        libelle: libelle(m, cfg),
        ref: m.ref,
        tiers: m.tiers,
        montant: m.montant,
        type: m.type,
        sources: [m.id]
      })
    } else {
      frais.push(m)
    }
  }

  if (frais.length > 0) {
    const [an, mois] = [periode.slice(0, 4), periode.slice(5, 7)]
    const detail: Record<string, number> = {}
    for (const t of [...new Set(frais.map((m) => m.type))].sort()) {
      detail[t] =
        Math.round(frais.filter((m) => m.type === t).reduce((s, m) => s + m.montant, 0) * 100) / 100
    }
    lignes.push({
      cle: cfg.agregation_frais.cle.replace('{periode}', periode),
      // dernier jour du mois : une ligne « Frais Cardmarket 06/2026 » datée du
      // 30/06 se lit sans explication et tombe toujours dans la bonne période
      date: finDeMois(periode),
      libelle: cfg.agregation_frais.libelle
        .replace('{mm_aaaa}', `${mois}/${an}`)
        .replace('{periode}', periode),
      ref: `FRAIS-${periode}`,
      tiers: '',
      montant: Math.round(frais.reduce((s, m) => s + m.montant, 0) * 100) / 100,
      type: 'Frais (agrégé)',
      sources: frais.map((m) => m.id).sort(),
      detail
    })
  }

  lignes.sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle))
  return lignes
}

/**
 * Un export Cardmarket déborde d'un jour ou deux sur le mois suivant. Si la
 * période choisie est celle du débordement, la ligne de frais serait calculée
 * sur une poignée de mouvements : il faut le dire AVANT d'importer.
 */
export function controlePeriode(mvts: Mouvement[], periode: string): string[] {
  const r = repartitionPeriodes(mvts)
  const n = r[periode] ?? 0
  const total = Object.values(r).reduce((s, v) => s + v, 0)
  if (n === 0 || total === n) return []
  if (n * 2 < total) {
    const principale = Object.entries(r).sort(([, a], [, b]) => b - a)[0][0]
    return [
      `PÉRIODE : ce fichier contient ${total} mouvements, dont seulement ${n} sur ${periode} ` +
        `(${Object.entries(r)
          .map(([p, v]) => `${p} : ${v}`)
          .join(', ')}). Le mois principal du fichier est ${principale}. Si tu voulais importer ` +
        `${principale}, change la période : une ligne de frais calculée sur un mois incomplet ` +
        `fausserait le compte 517.`
    ]
  }
  return []
}

// --- Anti-doublon ----------------------------------------------------------------

export function empreinte(contenu: string): string {
  return createHash('sha256').update(contenu, 'utf8').digest('hex')
}

export interface AnalyseResult {
  periode: string
  fichier: { nom: string; empreinte: string }
  soldes: { debut: number; fin: number }
  repartition: Record<string, number>
  aCreer: LigneOdoo[]
  dejaPresentes: number
  avertissements: string[]
}

/**
 * Trois barrières, de la plus fiable à la plus grossière :
 * 1. par transaction — unique_import_id côté Odoo (résiste au chevauchement) ;
 * 2. par ligne de frais — clé par période, écart de montant = alerte, rien
 *    n'est modifié automatiquement ;
 * 3. par fichier — empreinte SHA-256 dans le journal local (double-clic).
 */
export async function analyser(
  contenu: string,
  nomFichier: string,
  periode: string
): Promise<AnalyseResult> {
  const cfg = getCmTxConfig()
  const { mvts, soldes } = lireExport(contenu, cfg)
  const lignes = preparer(mvts, periode, cfg)
  const avertissements = controlePeriode(mvts, periode)

  // Mois PAS ENCORE CLOS : la ligne de frais serait partielle, et l'import de
  // fin de mois lèverait un écart — la compta s'importe mois terminé.
  const moisCourant = new Date().toISOString().slice(0, 7)
  if (periode >= moisCourant) {
    avertissements.unshift(
      `MOIS EN COURS : ${periode} n'est pas terminé — la ligne « Frais Cardmarket » serait ` +
        `calculée sur un mois partiel et devrait être corrigée à la main ensuite. ` +
        `Attends la fin du mois pour importer.`
    )
  }

  const db = getDb()
  const emp = empreinte(contenu)
  const vu = db
    .prepare('SELECT nom, importe_le, periode FROM cmtx_files WHERE empreinte = ?')
    .get(emp) as { nom: string; importe_le: string; periode: string } | undefined
  if (vu) {
    avertissements.push(
      `Ce fichier a déjà été importé le ${vu.importe_le.slice(0, 10)} (période ${vu.periode}). ` +
        `Les lignes déjà présentes dans Odoo seront écartées ci-dessous.`
    )
  }

  // Mois déjà saisi À LA MAIN dans Odoo ? Ces lignes n'ont pas d'étiquette
  // unique_import_id : l'anti-doublon ne les voit pas, donc on prévient —
  // importer par-dessus une saisie manuelle doublerait le journal.
  try {
    const { statementLinesInPeriod } = await import('./odoo')
    const [dFrom, dTo] = bornesDuMois(periode)
    const dansOdoo = await statementLinesInPeriod(dFrom, dTo)
    if (dansOdoo.manual > 0) {
      avertissements.push(
        `SAISIE MANUELLE : le journal contient déjà ${dansOdoo.manual} ligne(s) sur ${periode} ` +
          `(total ${dansOdoo.manualTotal.toFixed(2)} EUR) qui ne viennent PAS de l'outil — ` +
          `ce mois a probablement déjà été saisi à la main dans Odoo. L'anti-doublon ne ` +
          `reconnaît pas ces lignes : importer créerait des DOUBLONS. Règle : un mois = une ` +
          `seule méthode — n'importe pas ce mois, ou supprime d'abord la saisie manuelle.`
      )
    }
  } catch {
    // Odoo injoignable pour ce contrôle : l'analyse continue, les autres
    // barrières restent actives.
  }

  const { findStatementLines } = await import('./odoo')
  const presentes = await findStatementLines(lignes.map((l) => l.cle))
  const parCle = new Map(presentes.map((p) => [p.unique_import_id, p]))

  const aCreer: LigneOdoo[] = []
  for (const l of lignes) {
    const p = parCle.get(l.cle)
    if (!p) {
      aCreer.push(l)
      continue
    }
    if (l.type === 'Frais (agrégé)' && Math.abs(p.amount - l.montant) > 0.005) {
      avertissements.push(
        `FRAIS ${periode} : une ligne existe déjà dans Odoo pour ${p.amount.toFixed(2)} EUR, ` +
          `cet export en calcule ${l.montant.toFixed(2)} EUR (écart ${(l.montant - p.amount).toFixed(2)}). ` +
          `Causes possibles : un import précédent portait sur un fichier partiel, ou la période ` +
          `avait été mal choisie. Rien n'est modifié automatiquement : la ligne existante doit ` +
          `être corrigée ou complétée dans Odoo.`
      )
    }
  }

  return {
    periode,
    fichier: { nom: nomFichier, empreinte: emp },
    soldes,
    repartition: repartitionPeriodes(mvts),
    aCreer,
    dejaPresentes: lignes.length - aCreer.length,
    avertissements
  }
}

export async function importerDansOdoo(
  userId: number,
  analyse: AnalyseResult
): Promise<{ created: number }> {
  if (analyse.aCreer.length === 0) return { created: 0 }
  const { createStatementLines } = await import('./odoo')
  const ids = await createStatementLines(
    analyse.aCreer.map((l) => ({
      date: l.date,
      payment_ref: l.libelle,
      ref: l.ref,
      amount: l.montant,
      unique_import_id: l.cle
    }))
  )
  getDb()
    .prepare('INSERT OR REPLACE INTO cmtx_files VALUES (?, ?, ?, ?, ?)')
    .run(
      analyse.fichier.empreinte,
      analyse.fichier.nom,
      analyse.periode,
      new Date().toISOString().slice(0, 19),
      ids.length
    )
  logActivity(userId, 'cmtx.imported', {
    periode: analyse.periode,
    fichier: analyse.fichier.nom,
    lignes: ids.length
  })
  return { created: ids.length }
}

// --- Récupération automatique du fichier (session persist:cardmarket) -----------

export interface DownloadRow {
  id: number
  type: string
  debut: string
  fin: string
  nom: string
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
}

/** Lignes de la page Compte → Téléchargements, du plus récent au plus ancien. */
export function lignesTelechargements(html: string): DownloadRow[] {
  const re =
    /<tr>.*?<td[^>]*><span>([^<]*)<\/span><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*><span>([^<]*)<\/span><\/td>.*?name="idRequest"\s+value="(\d+)".*?<\/span>([^<]*)<\/button>/gs
  const out: DownloadRow[] = []
  for (const m of html.matchAll(re)) {
    out.push({
      id: parseInt(m[4], 10),
      type: unescapeHtml(m[1]).trim(),
      debut: m[2].trim(),
      fin: m[3].trim(),
      nom: unescapeHtml(m[5]).trim()
    })
  }
  // Repli tolérant : si la structure exacte des <td> a changé, on repère au
  // moins chaque bloc <tr> portant un idRequest — type = texte du bloc,
  // « prêt » = deux horodatages présents (Début ET Fin remplis).
  if (out.length === 0) {
    for (const chunk of html.split(/<tr[\s>]/g).slice(1)) {
      const id = chunk.match(/name="idRequest"\s+value="(\d+)"/)
      if (!id) continue
      const texte = unescapeHtml(chunk.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
      const dates = texte.match(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}(:\d{2})?/g) ?? []
      const nom = chunk.match(/<\/span>([^<]*)<\/button>/)
      out.push({
        id: parseInt(id[1], 10),
        type: texte,
        debut: dates[0] ?? '',
        fin: dates.length >= 2 ? dates[1] : '',
        nom: nom ? unescapeHtml(nom[1]).trim() : ''
      })
    }
  }
  return out.sort((a, b) => b.id - a.id)
}

export function bornesDuMois(periode: string): [string, string] {
  return [`${periode}-01`, finDeMois(periode)]
}

/**
 * Repère NOTRE export parmi les téléchargements. Terrain (16/08/2026) : on ne
 * peut PAS matcher le nom — Cardmarket renomme les dates soumises (mai
 * 01→31 devient « …_2026-05-30 », février 01→28 devient « …_2026-03-01 »).
 * Critère fiable : type « Bilan des transactions » + idRequest STRICTEMENT
 * postérieur à la référence relevée AVANT notre demande + colonne Fin remplie.
 */
export function trouverNotreExport(lignes: DownloadRow[], reference: number): DownloadRow | null {
  for (const l of lignes) {
    // lignes triées par id décroissant → premier PRÊT = le plus récent prêt
    if (l.id > reference && /transaction/i.test(l.type) && l.fin) return l
  }
  return null // rien de prêt postérieur à notre demande : on continue d'attendre
}

/**
 * Export PRÊT portant exactement le couple de dates demandé. Indispensable :
 * Cardmarket NE RECRÉE PAS un export identique (constaté le 17/08 — la
 * demande de mai n'a créé aucune ligne car « …05-01_05-31.csv » existait
 * déjà) — un mois clos déjà généré se télécharge donc directement.
 */
export function trouverParDates(
  lignes: DownloadRow[],
  debut: string,
  fin: string,
  ext: string
): DownloadRow | null {
  for (const l of lignes) {
    const n = l.nom.toLowerCase()
    if (n.includes(debut) && n.includes(fin) && n.endsWith('.' + ext) && l.fin) return l
  }
  return null
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Extraction des lignes de Téléchargements DANS la page (DOM réel, pas de
// regex ni de cache) — exécutée par executeJavaScript.
const ROWS_IN_PAGE = `(() => {
  const out = []
  for (const tr of document.querySelectorAll('tr')) {
    const inp = tr.querySelector('input[name="idRequest"]')
    if (!inp) continue
    const tds = tr.querySelectorAll('td')
    const btn = tr.querySelector('button[type="submit"]')
    out.push({
      id: parseInt(inp.value, 10),
      type: (tds[0] ? tds[0].innerText : '').trim(),
      debut: (tds[1] ? tds[1].innerText : '').trim(),
      fin: (tds[2] ? tds[2].innerText : '').trim(),
      nom: (btn ? btn.innerText : '').trim()
    })
  }
  return out
})()`

/**
 * Télécharge le Transaction Summary de la période. Leçon des 16-17/08 : les
 * requêtes du process principal (ses.fetch) voyaient une liste de
 * Téléchargements figée alors que la demande était acceptée — on pilote donc
 * une VRAIE page dans une fenêtre invisible (même session persist:cardmarket) :
 * chargements réels, formulaires soumis depuis la page, comme les clics de
 * l'utilisateur. Même technique éprouvée que l'import des ventes (PDF).
 */
export async function recupererExport(
  periode: string,
  onProgress?: (msg: string) => void
): Promise<{ nom: string; contenu: string }> {
  const [debut, fin] = bornesDuMois(periode)
  return recupererExportRange(debut, fin, onProgress)
}

/**
 * 🧪 Test de la chaîne de génération avec une plage LIBRE (avancé) : tous les
 * mois à données étant déjà générés côté Cardmarket (jamais recréés), seule
 * une plage inédite déclenche une vraie génération. Le test s'arrête à la
 * lecture du fichier — RIEN ne part vers Odoo (un demi-mois importé fausserait
 * la ligne de frais).
 */
export async function testerGeneration(
  debut: string,
  fin: string,
  onProgress?: (msg: string) => void
): Promise<{
  nom: string
  mouvements: number
  repartition: Record<string, number>
  lignes: { date: string; type: string; tiers: string; ref: string; montant: number }[]
}> {
  const { nom, contenu } = await recupererExportRange(debut, fin, onProgress)
  const { mvts } = lireExport(contenu, getCmTxConfig())
  return {
    nom,
    mouvements: mvts.length,
    repartition: repartitionPeriodes(mvts),
    // Le contenu lu, pour VOIR ce que le fichier contient (plafonné à 200)
    lignes: mvts.slice(0, 200).map((m) => ({
      date: m.date,
      type: m.type,
      tiers: m.tiers,
      ref: m.ref,
      montant: m.montant
    }))
  }
}

export async function recupererExportRange(
  debut: string,
  fin: string,
  onProgress?: (msg: string) => void
): Promise<{ nom: string; contenu: string }> {
  const cfg = getCmTxConfig()
  const site = cfg.site
  const { BrowserWindow, app } = await import('electron')
  const { writeFileSync } = await import('fs')
  const { join } = await import('path')

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: 'persist:cardmarket',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const charge = async (path: string): Promise<void> => {
    // nc : navigation réelle ET URL unique — aucune chance de cache
    const sep = path.includes('?') ? '&' : '?'
    await win.loadURL(`${site.base}${path}${sep}nc=${Date.now()}`)
  }
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>

  try {
    onProgress?.('Ouverture de la page Téléchargements…')
    await charge(site.page_telechargements)
    if (await js<boolean>(`!!document.querySelector('input[type="password"]')`)) {
      throw new Anomalie('Session Cardmarket expirée — connecte-toi dans l’onglet 🌐 Cardmarket puis réessaie.')
    }
    // Référence AVANT la demande : tout fichier déjà présent sera ignoré
    const avant = (await js<DownloadRow[]>(ROWS_IN_PAGE)).sort((a, b) => b.id - a.id)
    const reference = avant.reduce((mx, l) => Math.max(mx, l.id), 0)

    // Export identique déjà généré (mois clos) : Cardmarket ne le recrée pas —
    // on le télécharge directement, c'est instantané.
    let ligne: DownloadRow | null = trouverParDates(avant, debut, fin, site.format.toLowerCase())
    if (ligne) {
      onProgress?.(`Un export identique existe déjà (${ligne.nom}) — téléchargement direct.`)
    } else {
      // ⚠ Le formulaire d'export vit sur la page TRANSACTIONS — cette
      // navigation avait été perdue dans une restructuration (v2.34.1-3 :
      // « formulaire introuvable » car on le cherchait sur Téléchargements)
      onProgress?.(`Demande de génération ${debut} → ${fin}…`)
      await charge(site.page_details)
      const GEN_JS = `(async () => {
        const form = document.querySelector('form[action*="Reports_Asynchronous_ExportTransactions"]')
        if (!form) return { err: 'noform' }
        const fd = new FormData(form)
        fd.set('startDate', ${JSON.stringify(debut)})
        fd.set('endDate', ${JSON.stringify(fin)})
        fd.set('format', ${JSON.stringify(site.format)})
        const r = await fetch(form.action, { method: 'POST', body: fd, credentials: 'include' })
        return { ok: r.ok, status: r.status }
      })()`
      let gen = await js<{ err?: string; ok?: boolean; status?: number }>(GEN_JS)
      if (gen.err === 'noform') {
        // Page peut-être pas entièrement rendue : une seconde chance
        await sleep(2000)
        gen = await js<{ err?: string; ok?: boolean; status?: number }>(GEN_JS)
      }
      if (gen.err === 'noform') {
        try {
          const html = await js<string>('document.documentElement.outerHTML')
          writeFileSync(join(app.getPath('userData'), 'cm-export-debug.html'), html, 'utf-8')
        } catch {
          /* diagnostic seulement */
        }
        throw new Anomalie(
          'Formulaire d’export introuvable sur la page Transactions — la page vue par l’app ' +
            'a été enregistrée dans cm-export-debug.html, envoie-le-moi.'
        )
      }
      if (!gen.ok) throw new Anomalie(`Cardmarket a refusé la demande d'export (code ${gen.status}).`)

      onProgress?.('Génération en cours (~30 s), attente du fichier…')
      const limite = Date.now() + site.attente_max_s * 1000
      while (Date.now() < limite) {
        await sleep(site.intervalle_s * 1000)
        await charge(site.page_telechargements)
        const rows = (await js<DownloadRow[]>(ROWS_IN_PAGE)).sort((a, b) => b.id - a.id)
        // Nouvelle ligne… ou export identique réutilisé par Cardmarket
        ligne =
          trouverNotreExport(rows, reference) ??
          trouverParDates(rows, debut, fin, site.format.toLowerCase())
        if (ligne) break
        onProgress?.(`…génération en cours (${Math.max(0, Math.round((limite - Date.now()) / 1000))} s avant abandon)`)
      }
      if (!ligne) {
        // Diagnostic : la liste telle que la page la voit vraiment
        try {
          const html = await js<string>('document.documentElement.outerHTML')
          writeFileSync(join(app.getPath('userData'), 'cm-export-debug.html'), html, 'utf-8')
        } catch {
          /* diagnostic seulement */
        }
        throw new Anomalie(
          `Aucun nouveau fichier n'est apparu dans Compte → Téléchargements après ` +
            `${site.attente_max_s} s (la liste vue par l'app a été enregistrée dans ` +
            `cm-export-debug.html — envoie-le-moi si le fichier existe pourtant sur le site). ` +
            `En attendant : génère l'export sur le site puis « 📄 Choisir le fichier ».`
        )
      }
    }

    onProgress?.(`Fichier prêt : ${ligne.nom} — téléchargement…`)
    // Téléchargement = soumission RÉELLE du formulaire de la ligne (le clic de
    // l'utilisateur) : le navigateur suit lui-même la redirection Amazon, et
    // on intercepte le téléchargement qu'il déclenche. (fetch in-page = CORS,
    // ses.fetch = redirection refusée : constatés les 17/08.)
    const { session } = await import('electron')
    const { readFileSync, unlinkSync } = await import('fs')
    const ses = session.fromPartition('persist:cardmarket')
    const tmpPath = join(app.getPath('temp'), `cmtx-${Date.now()}.csv`)
    const contenu = await new Promise<string>((resolve, reject) => {
      const onDownload = (_e: unknown, item: Electron.DownloadItem): void => {
        clearTimeout(timer)
        item.setSavePath(tmpPath)
        item.once('done', (_e2, state) => {
          if (state === 'completed') {
            try {
              resolve(readFileSync(tmpPath, 'utf-8'))
            } catch (err) {
              reject(err)
            } finally {
              try {
                unlinkSync(tmpPath)
              } catch {
                /* temporaire */
              }
            }
          } else {
            reject(new Anomalie(`Téléchargement interrompu (${state}).`))
          }
        })
      }
      const timer = setTimeout(() => {
        ses.removeListener('will-download', onDownload)
        reject(new Anomalie('Le téléchargement ne s’est pas déclenché après 60 s.'))
      }, 60_000)
      ses.once('will-download', onDownload)
      js<string>(`(() => {
        const inp = [...document.querySelectorAll('input[name="idRequest"]')]
          .find((i) => i.value === ${JSON.stringify(String(ligne.id))})
        if (!inp) return 'norow'
        inp.closest('form').submit()
        return 'ok'
      })()`)
        .then((r) => {
          if (r === 'norow') {
            clearTimeout(timer)
            ses.removeListener('will-download', onDownload)
            reject(new Anomalie('Ligne introuvable dans la page Téléchargements.'))
          }
        })
        .catch((err) => {
          clearTimeout(timer)
          ses.removeListener('will-download', onDownload)
          reject(err)
        })
    })
    if (/<html/i.test(contenu.slice(0, 200))) {
      throw new Anomalie('Cardmarket a renvoyé une page au lieu du fichier — réessaie dans une minute.')
    }
    return { nom: ligne.nom, contenu }
  } finally {
    win.destroy()
  }
}
