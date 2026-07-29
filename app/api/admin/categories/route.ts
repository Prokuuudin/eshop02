import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath } from 'next/cache'
import type { CategoriesConfigPayload } from '@/lib/categories-config'
import { getCategoriesConfigFromStore, saveCategoriesConfigToStore } from '@/lib/categories-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getCategoriesConfigFromStore()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const payload = (await request.json()) as Partial<CategoriesConfigPayload>
    const saved = await saveCategoriesConfigToStore(payload)

    revalidatePath('/')
    revalidatePath('/catalog')
    revalidatePath('/admin/categories')

    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_categories' }, { status: 400 })
  }
}
