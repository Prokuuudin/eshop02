import { NextResponse } from 'next/server'
import { getBlogPosts } from '@/lib/blog-store'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const posts = await getBlogPosts()
  return NextResponse.json({ posts })
}
