import { NextResponse } from 'next/server'

/** Codes are supplied at checkout; invoice delivery requires an administrator. */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'invoice_code_at_checkout_only' }, { status: 410 })
}
