import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()

    const company = await prisma.company.update({
      where: { id },
      data: {
        companyName: body.companyName ?? undefined,
        cardNumber: body.cardNumber !== undefined ? (body.cardNumber?.trim() || null) : undefined,
        taxId: body.taxId !== undefined ? (body.taxId || null) : undefined,
        registrationNumber: body.registrationNumber !== undefined ? (body.registrationNumber || null) : undefined,
        address: body.address !== undefined ? (body.address || null) : undefined,
        city: body.city !== undefined ? (body.city || null) : undefined,
        country: body.country !== undefined ? (body.country || null) : undefined,
        contactPhone: body.contactPhone !== undefined ? (body.contactPhone || null) : undefined,
        contactEmail: body.contactEmail !== undefined ? (body.contactEmail || null) : undefined,
        accountManagerId: body.accountManagerId !== undefined ? (body.accountManagerId || null) : undefined,
        paymentTermDays: body.paymentTermDays ?? undefined,
        creditLimit: body.creditLimit !== undefined ? (body.creditLimit ?? null) : undefined,
        usedCredit: body.usedCredit ?? undefined,
        approvalWorkflowEnabled: body.approvalWorkflowEnabled ?? undefined,
      },
    })

    return NextResponse.json({ company })
  } catch (e) {
    console.error('[companies/:id PATCH]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    await prisma.company.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[companies/:id DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
