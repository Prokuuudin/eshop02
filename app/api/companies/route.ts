import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { toNum, toNumOrNull } from '@/lib/decimal'

function mapCompany(c: Awaited<ReturnType<typeof prisma.company.findMany>>[number]) {
  return {
    companyId: c.id,
    companyName: c.companyName,
    cardNumber: c.cardNumber ?? undefined,
    taxId: c.taxId ?? undefined,
    registrationNumber: c.registrationNumber ?? undefined,
    address: c.address ?? undefined,
    city: c.city ?? undefined,
    country: c.country ?? undefined,
    contactPhone: c.contactPhone ?? undefined,
    contactEmail: c.contactEmail ?? undefined,
    accountManagerId: c.accountManagerId ?? undefined,
    paymentTermDays: c.paymentTermDays as 0 | 30 | 60 | 90,
    creditLimit: toNumOrNull(c.creditLimit) ?? undefined,
    usedCredit: toNum(c.usedCredit),
    approvalWorkflowEnabled: c.approvalWorkflowEnabled,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    teamMembers: (c as { members?: unknown[] }).members ?? [],
  }
}

export async function GET() {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const where = user.platformRole === 'admin' ? {} : { id: user.companyId ?? '__none__' }

    const companies = await prisma.company.findMany({
      where,
      include: { members: true },
      orderBy: { companyName: 'asc' },
    })

    return NextResponse.json({ companies: companies.map(mapCompany) })
  } catch (e) {
    console.error('[companies GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json()
    if (!body.companyId || !body.companyName) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const company = await prisma.company.create({
      data: {
        id: body.companyId,
        companyName: body.companyName,
        cardNumber: body.cardNumber?.trim() || null,
        taxId: body.taxId || null,
        registrationNumber: body.registrationNumber || null,
        address: body.address || null,
        city: body.city || null,
        country: body.country || null,
        contactPhone: body.contactPhone || null,
        contactEmail: body.contactEmail || null,
        accountManagerId: body.accountManagerId || null,
        paymentTermDays: body.paymentTermDays ?? 0,
        creditLimit: body.creditLimit ?? null,
        approvalWorkflowEnabled: body.approvalWorkflowEnabled ?? false,
      },
      include: { members: true },
    })

    return NextResponse.json({ company: mapCompany(company) })
  } catch (e) {
    console.error('[companies POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
