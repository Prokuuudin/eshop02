import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const addresses = await prisma.savedAddress.findMany({
      where: { email: user.email },
    })
    return NextResponse.json({ addresses })
  } catch (e) {
    console.error('[user/addresses GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      id?: string
      firstName?: string
      lastName?: string
      phone?: string
      address?: string
      city?: string
      postalCode?: string
    }

    if (!body.firstName || !body.address || !body.city) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const clientId = body.id?.trim()
    const data = {
      firstName: body.firstName,
      lastName: body.lastName ?? '',
      phone: body.phone ?? '',
      address: body.address,
      city: body.city,
      postalCode: body.postalCode ?? null,
    }

    let saved
    if (clientId) {
      // Verify ownership before allowing update — prevent IDOR
      const existing = await prisma.savedAddress.findUnique({ where: { id: clientId } })
      if (existing && existing.email !== user.email) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      saved = await prisma.savedAddress.upsert({
        where: { id: clientId },
        create: { id: clientId, email: user.email, ...data },
        update: data,
      })
    } else {
      // New address — always generate id server-side
      saved = await prisma.savedAddress.create({
        data: { id: randomUUID(), email: user.email, ...data },
      })
    }

    return NextResponse.json({ address: saved })
  } catch (e) {
    console.error('[user/addresses POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
