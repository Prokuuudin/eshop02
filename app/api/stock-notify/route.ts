import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      productId?: string
      productTitle?: string
      email?: string
    }

    const { productId, productTitle, email } = body
    if (!productId || !email) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    // Get userId from session if available
    const user = await getServerUser()
    const userId = user?.id ?? null

    const sub = await prisma.stockNotification.upsert({
      where: { productId_email: { productId, email: email.toLowerCase().trim() } },
      create: {
        id: randomUUID(),
        productId,
        productTitle: productTitle ?? '',
        email: email.toLowerCase().trim(),
        userId,
        notified: false,
      },
      update: { notified: false, notifiedAt: null },
    })

    return NextResponse.json({ id: sub.id })
  } catch (e) {
    console.error('[stock-notify POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
