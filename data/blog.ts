import type { Language } from './translations'

export type BlogHeadingBlock = {
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

export type BlogParagraphBlock = {
  type: 'paragraph'
  text: string
}

export type BlogListBlock = {
  type: 'list'
  ordered?: boolean
  items: string[]
}

export type BlogQuoteBlock = {
  type: 'quote'
  text: string
  author?: string
}

export type BlogImageBlock = {
  type: 'image'
  src: string
  alt: string
  caption?: string
}

export type BlogGalleryBlock = {
  type: 'gallery'
  images: Array<{
    src: string
    alt: string
    caption?: string
  }>
}

export type BlogContentBlock =
  | BlogHeadingBlock
  | BlogParagraphBlock
  | BlogListBlock
  | BlogQuoteBlock
  | BlogImageBlock
  | BlogGalleryBlock

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  contentBlocks?: BlogContentBlock[]
  author: string
  image: string
  category: string
  readTime: number
  createdAt: Date
  updatedAt?: Date
  featured?: boolean
  translations?: Partial<Record<Language, Partial<Pick<BlogPost, 'title' | 'excerpt' | 'content' | 'contentBlocks' | 'author' | 'category'>>>>
}

export const localizeBlogPost = (post: BlogPost, language: Language): BlogPost => {
  const localized = post.translations?.[language]

  if (!localized) {
    return post
  }

  return {
    ...post,
    title: localized.title ?? post.title,
    excerpt: localized.excerpt ?? post.excerpt,
    content: localized.content ?? post.content,
    contentBlocks: localized.contentBlocks ?? post.contentBlocks,
    author: localized.author ?? post.author,
    category: localized.category ?? post.category
  }
}

