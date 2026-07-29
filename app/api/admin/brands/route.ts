import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath } from 'next/cache'
import type { BrandsConfigPayload } from '@/lib/brands-config'
import { getBrandsConfigFromStore, saveBrandsConfigToStore } from '@/lib/brands-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getBrandsConfigFromStore()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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
