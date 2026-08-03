import { NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath } from 'next/cache'
import { deleteBlogPostById, getAllBlogPosts } from '@/lib/blog-store'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(_: Request, { params }: RouteContext): Promise<NextResponse> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }

  const posts = await getAllBlogPosts()
  const deletedPost = posts.find((post) => post.id === id)

  await deleteBlogPostById(id)

  revalidatePath('/blog')
  if (deletedPost?.slug) {
    revalidatePath(`/blog/${deletedPost.slug}`)
  }

  return NextResponse.json({ ok: true })
}
