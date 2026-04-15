import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { saveSiteContentOverridesToStore, type SiteContentOverrides } from '@/lib/site-content-server-store'

export const runtime = 'nodejs'

export async function PUT(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<SiteContentOverrides>
    const saved = await saveSiteContentOverridesToStore(payload)

    revalidatePath('/')
    revalidatePath('/blog')
    revalidatePath('/catalog')
    revalidatePath('/about')

    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_site_content' }, { status: 400 })
  }
}
