import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function GET() {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const items = await prisma.wishlistItem.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: 'desc' },
    })

    return NextResponse.json({ productIds: items.map((i) => i.productId) })
  } catch (e) {
    console.error('[wishlist GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { productId } = await req.json()
    if (!productId) return NextResponse.json({ error: 'productId_required' }, { status: 400 })

    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      create: { userId: user.id, productId },
      update: {},
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[wishlist POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { productId } = await req.json()
    if (productId) {
      await prisma.wishlistItem.deleteMany({
        where: { userId: user.id, productId },
      })
    } else {
      // Clear all
      await prisma.wishlistItem.deleteMany({ where: { userId: user.id } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[wishlist DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
