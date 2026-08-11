/** Creates a real A4 PDF from invoice HTML. Canvas rendering preserves Latvian
 * diacritics and translated product names without relying on PDF base fonts. */
export async function buildInvoicePdfBlob(html: string): Promise<Blob> {
  const cached = pdfCache.get(html)
  if (cached) return cached

  const pending = renderInvoicePdfBlob(html).catch((error: unknown) => {
    pdfCache.delete(html)
    throw error
  })
  pdfCache.set(html, pending)
  trimPdfCache()
  return pending
}

const pdfCache = new Map<string, Promise<Blob>>()
const MAX_CACHED_PDFS = 4

function trimPdfCache(): void {
  while (pdfCache.size > MAX_CACHED_PDFS) {
    const oldestKey = pdfCache.keys().next().value
    if (oldestKey === undefined) return
    pdfCache.delete(oldestKey)
  }
}

async function renderInvoicePdfBlob(html: string): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const frame = await createInvoiceFrame(html)

  try {
    const body = frame.contentDocument?.body
    if (!body) throw new Error('Invoice preview document is unavailable')
    const canvas = await html2canvas(body, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      width: 794,
      height: body.scrollHeight,
    })
    return canvasToA4Pdf(canvas, jsPDF)
  } finally {
    frame.remove()
  }
}

async function createInvoiceFrame(html: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)

  await new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve()
    frame.onerror = () => reject(new Error('Invoice preview frame failed to load'))
    frame.srcdoc = html
  })

  const doc = frame.contentDocument
  if (!doc) throw new Error('Invoice preview document is unavailable')
  const images = Array.from(doc.images)
  await Promise.all(images.map(async (image) => {
    if (!image.complete) await image.decode()
  }))
  frame.style.height = `${Math.max(doc.body.scrollHeight, 1123)}px`
  return frame
}

type JsPdfConstructor = typeof import('jspdf')['jsPDF']

function canvasToA4Pdf(canvas: HTMLCanvasElement, JsPdf: JsPdfConstructor): Blob {
  const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const margin = 10
  const pageWidth = 210 - margin * 2
  const pageHeight = 297 - margin * 2
  const sourcePageHeight = Math.floor(canvas.width * pageHeight / pageWidth)
  let sourceY = 0
  let page = 0

  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const context = pageCanvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    if (page > 0) pdf.addPage('a4', 'portrait')
    const renderedHeight = sliceHeight * pageWidth / canvas.width
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, pageWidth, renderedHeight, undefined, 'FAST')
    sourceY += sliceHeight
    page++
  }

  return pdf.output('blob')
}

export function invoicePdfFileName(orderId: string, lang: 'lv' | 'en'): string {
  return `invoice-${orderId}${lang === 'en' ? '-en' : ''}.pdf`
}
