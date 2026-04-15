import React from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { localizeBlogPost } from '@/data/blog'
import BlogPostContent from '@/components/BlogPostContent'
import { getSiteUrl } from '@/lib/site-url'
import type { Language } from '@/data/translations'
import { getBlogPostBySlug, getBlogPosts } from '@/lib/blog-store'

type Params = {
  slug: string
}

type PageProps = {
  params: Promise<Params>
}

export const revalidate = 3600

export async function generateStaticParams(): Promise<Params[]> {
  const posts = await getBlogPosts()
  return posts.map((post) => ({
    slug: post.slug
  }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPostBySlug(slug)
  const language: Language = 'en'
  if (!post) {
    return {
      title: 'Article not found | BeautyShop',
      description: 'Requested article was not found',
      robots: {
        index: false,
        follow: false
      }
    }
  }

  const localizedPost = localizeBlogPost(post, language)

  const path = `/blog/${localizedPost.slug}`

  return {
    title: `${localizedPost.title} | BeautyShop`,
    description: localizedPost.excerpt,
    openGraph: {
      title: `${localizedPost.title} | BeautyShop`,
      description: localizedPost.excerpt,
      images: [{ url: localizedPost.image, alt: localizedPost.title }],
      url: path,
      type: 'article'
    },
    alternates: {
      canonical: path
    }
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getBlogPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const allPosts = await getBlogPosts()
  const relatedPosts = allPosts.filter(
    (p) => p.category === post.category && p.id !== post.id
  ).slice(0, 3)
  const language: Language = 'en'
  const localizedPost = localizeBlogPost(post, language)

  const siteUrl = getSiteUrl()
  const postUrl = `${siteUrl}/blog/${localizedPost.slug}`

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: (language as Language) === 'ru' ? 'Главная' : (language as Language) === 'lv' ? 'Sākums' : 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: (language as Language) === 'ru' ? 'Блог' : (language as Language) === 'lv' ? 'Blogs' : 'Blog', item: `${siteUrl}/blog` },
      { '@type': 'ListItem', position: 3, name: localizedPost.title, item: postUrl }
    ]
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <BlogPostContent post={post} relatedPosts={relatedPosts} postUrl={postUrl} />
    </>
  )
}
