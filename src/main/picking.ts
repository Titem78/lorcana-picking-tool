import { getDb, logActivity } from './db'
import { listLocations, resolveLocation } from './locations'
import { canonicalRarity } from './pdf-parser'
import type {
  CardFacts,
  OrderLine,
  PickingItem,
  PickingList,
  PickingSection,
  StorageLocation
} from '@shared/types'

// Liste de picking globale : toutes les lignes restantes des commandes
// actives, groupées par emplacement (ordre = priorité des emplacements),
// puis par carte physique identique (chapitre + numéro + foil + langue).
// Une carte demandée par plusieurs clients apparaît UNE fois, avec la
// répartition par commande à cocher ligne par ligne.

interface LineRow extends OrderLine {
  sale_id: string
  buyer_username: string
  picked_by_name: string | null
}

export function lineFacts(line: OrderLine): CardFacts {
  return {
    color: line.ink ?? line.color_label ?? '',
    rarity: line.rarity ?? canonicalRarity(line.rarity_code ?? ''),
    chapter: parseInt(line.set_code ?? '0', 10) || 0,
    is_foil: line.is_foil === 1,
    language: line.language ?? ''
  }
}

export function buildPickingList(): PickingList {
  const db = getDb()
  const lines = db
    .prepare(
      `SELECT l.*, o.sale_id, o.buyer_username, u.name AS picked_by_name
       FROM order_lines l
       JOIN orders o ON o.id = l.order_id
       LEFT JOIN users u ON u.id = l.picked_by
       WHERE o.status IN ('imported', 'picking')
       ORDER BY l.id`
    )
    .all() as LineRow[]

  const locations = listLocations()
  const sectionMap = new Map<number | null, PickingSection>()
  const orderIds = new Set<number>()

  // Visuels personnalisés des accessoires (dés, troves, displays...)
  const customImages = new Map(
    (
      db.prepare('SELECT line_name, image_file FROM accessory_images').all() as {
        line_name: string
        image_file: string
      }[]
    ).map((r) => [r.line_name, r.image_file])
  )

  for (const line of lines) {
    orderIds.add(line.order_id)
    const loc: StorageLocation | null = resolveLocation(lineFacts(line), locations)
    const locId = loc?.id ?? null
    let section = sectionMap.get(locId)
    if (!section) {
      section = {
        location_id: locId,
        location_name: loc?.name ?? 'Non assigné',
        location_color: loc?.color ?? null,
        location_label: loc?.label ?? null,
        items: []
      }
      sectionMap.set(locId, section)
    }

    // Identité physique : pour une carte, chapitre+numéro suffit ; pour un
    // accessoire (pas de numéro), le nom fait l'identité.
    const key = [line.section, line.set_code, line.number || line.name, line.is_foil, line.language].join('|')
    let item = section.items.find((i) => i.key === key)
    if (!item) {
      item = {
        key,
        name: line.name,
        section: line.section,
        lorcast_name: line.lorcast_name,
        number: line.number,
        set_code: line.set_code,
        ink: line.ink ?? line.color_label ?? '',
        rarity: line.rarity ?? canonicalRarity(line.rarity_code ?? ''),
        is_foil: line.is_foil === 1,
        language: line.language ?? '',
        // Un visuel personnalisé (clic droit) est PRIORITAIRE : il corrige les
        // variantes (V.2, promos) dont l'image Lorcast par numéro serait trompeuse.
        image_file: customImages.get(line.name) ?? line.image_file ?? null,
        image_large_file: customImages.get(line.name) ?? line.image_large_file ?? null,
        total_qty: 0,
        picked_qty: 0,
        sublines: []
      }
      section.items.push(item)
    }
    if (!item.image_file && line.image_file) item.image_file = line.image_file
    if (!item.image_large_file && line.image_large_file) item.image_large_file = line.image_large_file
    item.total_qty += line.quantity
    item.picked_qty += Math.min(line.picked_qty, line.quantity)
    item.sublines.push({
      line_id: line.id,
      order_id: line.order_id,
      sale_id: line.sale_id,
      buyer_username: line.buyer_username,
      quantity: line.quantity,
      condition: line.condition,
      comment: line.comment,
      price: line.price,
      picked_qty: line.picked_qty,
      picked_by_name: line.picked_by_name,
      picked_at: line.picked_at
    })
  }

  // Ordre des sections = ordre des emplacements ; « Non assigné » en dernier.
  const sections: PickingSection[] = []
  for (const loc of locations) {
    const s = sectionMap.get(loc.id)
    if (s && s.items.length) sections.push(s)
  }
  const unassigned = sectionMap.get(null)
  if (unassigned && unassigned.items.length) sections.push(unassigned)

  // Tri des cartes dans chaque section : chapitre, puis numéro.
  for (const s of sections) {
    s.items.sort(
      (a, b) =>
        (parseInt(a.set_code ?? '0', 10) || 0) - (parseInt(b.set_code ?? '0', 10) || 0) ||
        (parseInt(a.number ?? '0', 10) || 0) - (parseInt(b.number ?? '0', 10) || 0)
    )
  }

  const total_qty = lines.reduce((s, l) => s + l.quantity, 0)
  const picked_qty = lines.reduce((s, l) => s + Math.min(l.picked_qty, l.quantity), 0)
  return { sections, total_qty, picked_qty, order_count: orderIds.size }
}

/**
 * Fixe la quantité sortie d'une ligne, exemplaire par exemplaire (compteur).
 * Traçabilité : qui, quand. Met à jour le statut de la commande :
 * picking en cours, picked quand tout est sorti.
 */
export function setPickedQty(userId: number, lineId: number, qty: number): void {
  const db = getDb()
  const line = db.prepare('SELECT * FROM order_lines WHERE id = ?').get(lineId) as
    | OrderLine
    | undefined
  if (!line) return
  const clamped = Math.max(0, Math.min(line.quantity, Math.round(qty)))

  if (clamped > 0) {
    db.prepare(
      `UPDATE order_lines SET picked_qty = ?,
         picked_at = datetime('now', 'localtime'), picked_by = ? WHERE id = ?`
    ).run(clamped, userId, lineId)
  } else {
    db.prepare(
      'UPDATE order_lines SET picked_qty = 0, picked_at = NULL, picked_by = NULL WHERE id = ?'
    ).run(lineId)
  }
  logActivity(userId, 'pick.qty', {
    lineId,
    orderId: line.order_id,
    card: `${line.set_code}/${line.number} ${line.name}`,
    qty: clamped,
    of: line.quantity
  })

  const remaining = getDb()
    .prepare('SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ? AND picked_qty < quantity')
    .get(line.order_id) as { n: number }
  const newStatus = remaining.n === 0 ? 'picked' : 'picking'
  const current = getDb().prepare('SELECT status FROM orders WHERE id = ?').get(line.order_id) as {
    status: string
  }
  if (current.status !== newStatus && ['imported', 'picking', 'picked'].includes(current.status)) {
    getDb().prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, line.order_id)
    if (newStatus === 'picked') {
      logActivity(userId, 'order.picked_complete', { orderId: line.order_id })
    }
  }
}

/** Coche/décoche une ligne entière (compat : équivaut au compteur à fond ou à zéro). */
export function pickLine(userId: number, lineId: number, picked: boolean): void {
  setPickedQty(userId, lineId, picked ? Number.MAX_SAFE_INTEGER : 0)
}

/**
 * Associe un visuel depuis une URL (adresse d'image copiée depuis le
 * navigateur, ex. image produit Cardmarket). Téléchargé avec une identité de
 * navigateur ; si l'URL est une page HTML, on tente d'en extraire og:image.
 */
export async function setAccessoryImageFromUrl(
  userId: number,
  lineName: string,
  url: string
): Promise<string> {
  const { join } = await import('path')
  const { writeFileSync } = await import('fs')
  const { imagesDir } = await import('./lorcast')

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  let target = url.trim()
  if (!/^https?:\/\//i.test(target)) throw new Error('Adresse invalide (elle doit commencer par https://)')

  // Les images Cardmarket (S3) exigent le Referer cardmarket.com
  const headers: Record<string, string> = { 'User-Agent': UA }
  if (/cardmarket/i.test(target)) headers.Referer = 'https://www.cardmarket.com/'
  let res = await fetch(target, { headers, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Téléchargement refusé (HTTP ${res.status}) — copie plutôt l'adresse de l'IMAGE (clic droit → Copier l'adresse de l'image)`)
  let contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('text/html')) {
    // C'est une page : on cherche l'image principale (og:image)
    const html = await res.text()
    const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/) ??
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/)
    if (!og) throw new Error("Pas d'image trouvée sur cette page — copie l'adresse de l'image directement")
    target = og[1]
    if (/cardmarket/i.test(target)) headers.Referer = 'https://www.cardmarket.com/'
    res = await fetch(target, { headers, signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`Image inaccessible (HTTP ${res.status})`)
    contentType = res.headers.get('content-type') ?? ''
  }

  const extFromType = contentType.match(/image\/(png|jpeg|jpg|webp|avif|gif)/)?.[1]
  const extFromUrl = target.split('?')[0].split('.').pop()?.toLowerCase()
  const ext = extFromType ?? (['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'].includes(extFromUrl ?? '') ? extFromUrl : 'jpg')
  const fname = `accessory_${lineName.replace(/[^\w-]/g, '_').slice(0, 60)}.${ext === 'jpeg' ? 'jpg' : ext}`
  writeFileSync(join(imagesDir(), fname), Buffer.from(await res.arrayBuffer()))
  getDb()
    .prepare(
      `INSERT INTO accessory_images (line_name, image_file) VALUES (?, ?)
       ON CONFLICT(line_name) DO UPDATE SET image_file = excluded.image_file`
    )
    .run(lineName, fname)
  logActivity(userId, 'accessory.image_set', { lineName, fname, from: 'url' })
  return fname
}

/**
 * Associe un visuel personnalisé (fichier image choisi par l'utilisateur) à un
 * produit accessoire — copié dans le cache et réutilisé partout ensuite.
 */
export async function setAccessoryImage(
  userId: number,
  lineName: string,
  win: Electron.BrowserWindow
): Promise<string | null> {
  const { dialog } = await import('electron')
  const { copyFileSync } = await import('fs')
  const { extname, join } = await import('path')
  const { imagesDir } = await import('./lorcast')

  const res = await dialog.showOpenDialog(win, {
    title: `Choisir un visuel pour « ${lineName} »`,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null

  const src = res.filePaths[0]
  const fname = `accessory_${lineName.replace(/[^\w-]/g, '_').slice(0, 60)}${extname(src).toLowerCase()}`
  copyFileSync(src, join(imagesDir(), fname))
  getDb()
    .prepare(
      `INSERT INTO accessory_images (line_name, image_file) VALUES (?, ?)
       ON CONFLICT(line_name) DO UPDATE SET image_file = excluded.image_file`
    )
    .run(lineName, fname)
  logActivity(userId, 'accessory.image_set', { lineName, fname })
  return fname
}
