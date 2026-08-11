/** Creates a real A4 PDF from invoice HTML. Canvas rendering preserves Latvian
 * diacritics and translated product names without relying on PDF base fonts. */
export async function buildInvoicePdfBlob(html: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  await pdf.html(html, {
    margin: [10, 10, 10, 10],
    autoPaging: 'text',
    width: 190,
    windowWidth: 900,
    html2canvas: {
      scale: 0.9,
      useCORS: true,
      backgroundColor: '#ffffff',
    },
  })

  return pdf.output('blob')
}

export function invoicePdfFileName(orderId: string, lang: 'lv' | 'en'): string {
  return `invoice-${orderId}${lang === 'en' ? '-en' : ''}.pdf`
}
