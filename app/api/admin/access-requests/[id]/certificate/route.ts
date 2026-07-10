import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { readCertificate, parseDataUrl } from '@/lib/certificate-store'

export const runtime = 'nodejs'

// Просмотр сертификата мастера админом. Файл лежит в KV только пока заявка
// на рассмотрении — после решения ключ удаляется и роут отвечает 404.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const cert = await readCertificate(prisma, id)
    if (!cert) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const parsed = parseDataUrl(cert.data)
    if (!parsed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const safeName = cert.name.replace(/[^\w.\- ]/g, '_')
    return new NextResponse(new Uint8Array(parsed.buffer), {
      headers: {
        'Content-Type': parsed.contentType,
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[admin/access-requests/:id/certificate GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
