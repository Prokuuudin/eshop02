import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath } from 'next/cache'
import { saveSiteContentOverridesToStore, type SiteContentOverrides } from '@/lib/site-content-server-store'

export const runtime = 'nodejs'

export async function PUT(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const payload = (await request.json()) as Partial<SiteContentOverrides>
    const saved = await saveSiteContentOverridesToStore(payload)

    revalidatePath('/')
    revalidatePath('/blog')
    revalidatePath('/catalog')

    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_site_content' }, { status: 400 })
  }
}
