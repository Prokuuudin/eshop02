import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { BrandsConfigPayload } from '@/lib/brands-config'
import { getBrandsConfigFromStore, saveBrandsConfigToStore } from '@/lib/brands-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getBrandsConfigFromStore()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<BrandsConfigPayload>
    const saved = await saveBrandsConfigToStore(payload)

    revalidatePath('/')
    revalidatePath('/catalog')
    revalidatePath('/brand')
    revalidatePath('/admin/brands')

    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_brands' }, { status: 400 })
  }
}
