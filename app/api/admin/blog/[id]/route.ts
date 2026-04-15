import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { deleteBlogPostById, getBlogPosts } from '@/lib/blog-store'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(_: Request, { params }: RouteContext): Promise<NextResponse> {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 })
  }

  const posts = await getBlogPosts()
  const deletedPost = posts.find((post) => post.id === id)

  await deleteBlogPostById(id)

  revalidatePath('/blog')
  if (deletedPost?.slug) {
    revalidatePath(`/blog/${deletedPost.slug}`)
  }

  return NextResponse.json({ ok: true })
}
