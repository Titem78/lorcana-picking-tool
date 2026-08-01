// Rendu du visuel d'un timbre : découpe depuis sa planche PDF (pdfjs).
// Les planches sont mises en cache pour ne les rendre qu'une fois par session
// d'impression (utile en impression groupée).

export interface StampPrintData {
  sheet_file: string
  page: number
  sd_x: number
  sd_y: number
  number: string
  stamp_type: string
}

const sheetCache = new Map<string, HTMLCanvasElement>()

async function renderSheet(file: string, page: number): Promise<{ canvas: HTMLCanvasElement; pageH: number; scale: number }> {
  const key = `${file}#${page}`
  const scale = 4
  const cached = sheetCache.get(key)
  if (cached) return { canvas: cached, pageH: Number(cached.dataset.pageH), scale }

  const bytes = (await window.api.stamps.sheetData(file)) as Uint8Array
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  const doc = await task.promise
  const p = await doc.getPage(page)
  const viewport = p.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await p.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas }).promise
  canvas.dataset.pageH = String(p.view[3])
  const pageH = p.view[3]
  await task.destroy()
  sheetCache.set(key, canvas)
  return { canvas, pageH, scale }
}

/** Dessine le timbre (cellule autour du n° SD) dans le canvas cible. */
export async function drawStamp(data: StampPrintData, target: HTMLCanvasElement): Promise<void> {
  const { canvas, pageH, scale } = await renderSheet(data.sheet_file, data.page)
  const x0 = data.sd_x - 176
  const yTop = data.sd_y + 92
  const w = 188
  const h = 104
  target.width = w * scale
  target.height = h * scale
  target
    .getContext('2d')!
    .drawImage(canvas, x0 * scale, (pageH - yTop) * scale, w * scale, h * scale, 0, 0, w * scale, h * scale)
}

export function clearSheetCache(): void {
  sheetCache.clear()
}
