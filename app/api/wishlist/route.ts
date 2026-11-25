import { NextRequest, NextResponse } from 'next/server'
import { isAccountOwnerMissing, lockAccountOwner } from '@/lib/account-owner-lock'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const items = await prisma.wishlistItem.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: 'desc' },
    })

    return NextResponse.json({ productIds: items.map((i) => i.productId) })
  } catch (e) {
    logApiError("[wishlist GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { productId } = await req.json()
    if (!productId) return NextResponse.json({ error: 'productId_required' }, { status: 400 })

    // WishlistItem.userId has no foreign key: lock the owner (see lib/account-owner-lock).
    await prisma.$transaction(async (tx) => {
      await lockAccountOwner(tx, user.id)
      await tx.wishlistItem.upsert({
        where: { userId_productId: { userId: user.id, productId } },
        create: { userId: user.id, productId },
        update: {},
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isAccountOwnerMissing(e)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    logApiError("[wishlist POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
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
    logApiError("[wishlist DELETE]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


