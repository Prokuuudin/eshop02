import { NextRequest, NextResponse } from 'next/server'

type AccountManagerMessage = {
  id: string
  companyId: string
  from: 'client' | 'manager'
  text: string
  createdAt: string
  authorName?: string
}

const messageStore: AccountManagerMessage[] = []

const parseCompanyId = (req: NextRequest): string | null => {
  const companyIdHeader = req.headers.get('x-company-id')
  if (companyIdHeader) return companyIdHeader

  const companyIdQuery = new URL(req.url).searchParams.get('companyId')
  return companyIdQuery || null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const companyId = parseCompanyId(req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const messages = messageStore
    .filter((message) => message.companyId === companyId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return NextResponse.json({ messages })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as {
    companyId?: string
    text?: string
    from?: 'client' | 'manager'
    authorName?: string
  }

  const companyId = body.companyId || parseCompanyId(req)
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const text = (body.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const message: AccountManagerMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    companyId,
    from: body.from || 'client',
    text,
    createdAt: new Date().toISOString(),
    authorName: body.authorName
  }

  messageStore.push(message)

  // Placeholder for email/notification integration.
  console.info('[account-manager] new message', {
    companyId,
    messageId: message.id,
    from: message.from
  })

  return NextResponse.json({ message }, { status: 201 })
}
