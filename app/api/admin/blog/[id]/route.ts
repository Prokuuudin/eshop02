import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath } from 'next/cache'
import { deleteBlogPostById } from '@/lib/blog-store'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }

  const deletedPost = await deleteBlogPostById(id, { actor, request })

  revalidatePath('/blog')
  if (deletedPost?.slug) {
    revalidatePath(`/blog/${deletedPost.slug}`)
  }

  return NextResponse.json({ ok: true })
}
