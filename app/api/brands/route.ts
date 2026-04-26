import { NextResponse } from 'next/server'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getBrandsConfigFromStore()
  return NextResponse.json(config)
}
