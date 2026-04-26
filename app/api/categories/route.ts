import { NextResponse } from 'next/server'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getCategoriesConfigFromStore()
  return NextResponse.json(config)
}
