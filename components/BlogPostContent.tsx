'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Bookmark, BookmarkCheck, CalendarDays, Clock3 } from 'lucide-react'
import BlogCard from '@/components/BlogCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { localizeBlogPost, type BlogContentBlock, type BlogPost } from '@/data/blog'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'
import { formatDate, getLocaleFromLanguage } from '@/lib/utils'

type BlogPostContentProps = {
  post: BlogPost
  relatedPosts: BlogPost[]
  postUrl: string
}

const ARTICLE_FAVORITES_KEY = 'blog-favorites'
const TOPIC_TO_PRODUCT_CATEGORY: Record<string, string> = {
  'уход за лицом': 'face',
  'face care': 'face',
  'sejas kopšana': 'face',
  'уход за волосами': 'hair',
  'hair care': 'hair',
  'matu kopšana': 'hair',
  'уход за телом': 'body',
  'body care': 'body',
  'ķermeņa kopšana': 'body',
  'макияж': 'face',
  'makeup': 'face',
  'grims': 'face',
  'ингредиенты': 'face',
  'ingredients': 'face',
  'sastāvdaļas': 'face'
}

export default function BlogPostContent({ post, relatedPosts, postUrl }: BlogPostContentProps) {
  const { t, language } = useTranslation()
  const { resolveImageSrc } = useSiteContent()
  const locale = getLocaleFromLanguage(language)
  const localizedPost = React.useMemo(() => localizeBlogPost(post, language), [post, language])
  const [isSaved, setIsSaved] = React.useState(false)

  const formattedPublishedAt = formatDate(localizedPost.createdAt, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const hasUpdatedAt = Boolean(localizedPost.updatedAt)
  const formattedUpdatedAt = formatDate(localizedPost.updatedAt ?? localizedPost.createdAt, locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const encodedPostUrl = encodeURIComponent(postUrl)
  const encodedTitle = encodeURIComponent(localizedPost.title)
  const emailBody = encodeURIComponent(`${localizedPost.title}\n${postUrl}`)

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedPostUrl}`,
    x: `https://twitter.com/intent/tweet?url=${encodedPostUrl}&text=${encodedTitle}`,
    telegram: `https://t.me/share/url?url=${encodedPostUrl}&text=${encodedTitle}`,
    email: `mailto:?subject=${encodedTitle}&body=${emailBody}`
  }

  React.useEffect(() => {
    try {
      const storedRaw = localStorage.getItem(ARTICLE_FAVORITES_KEY)
      if (!storedRaw) {
        setIsSaved(false)
        return
      }

      const savedSlugs = JSON.parse(storedRaw) as string[]
      setIsSaved(Array.isArray(savedSlugs) && savedSlugs.includes(localizedPost.slug))
    } catch {
      setIsSaved(false)
    }
  }, [localizedPost.slug])

  const toggleSaved = (): void => {
    try {
      const storedRaw = localStorage.getItem(ARTICLE_FAVORITES_KEY)
      const savedSlugs = storedRaw ? (JSON.parse(storedRaw) as string[]) : []
      const normalizedSavedSlugs = Array.isArray(savedSlugs) ? savedSlugs : []

      const nextSaved = isSaved
        ? normalizedSavedSlugs.filter((slug) => slug !== localizedPost.slug)
        : [...normalizedSavedSlugs, localizedPost.slug]

      localStorage.setItem(ARTICLE_FAVORITES_KEY, JSON.stringify(nextSaved))
      setIsSaved(!isSaved)
    } catch {
      setIsSaved(!isSaved)
    }
  }

  const categoryKeyMap: Record<string, string> = {
    'уход за лицом': 'blog.category.faceCare',
    'уход за волосами': 'blog.category.hairCare',
    'уход за телом': 'blog.category.bodyCare',
    'макияж': 'blog.category.makeup',
    'ингредиенты': 'blog.category.ingredients'
  }

  const relatedCatalogCategory = React.useMemo(() => {
    const topic = localizedPost.category.toLowerCase()
    const fallbackTopic = post.category.toLowerCase()
    return TOPIC_TO_PRODUCT_CATEGORY[topic] ?? TOPIC_TO_PRODUCT_CATEGORY[fallbackTopic] ?? ''
  }, [localizedPost.category, post.category])

  const markdownToHtml = (md: string): React.ReactNode => {
    const lines = md.split('\n').filter((line) => line.trim())

    return lines.map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-3xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100">{line.slice(2)}</h1>
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-2xl font-bold mt-5 mb-2 text-gray-900 dark:text-gray-100">{line.slice(3)}</h2>
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={idx} className="font-bold mt-2 text-gray-900 dark:text-gray-100">{line.slice(2, -2)}</p>
      }
      if (line.startsWith('- ')) {
        return <li key={idx} className="ml-4 text-gray-700 dark:text-gray-300">{line.slice(2)}</li>
      }
      if (line.startsWith('1. ') || line.match(/^\d+\. /)) {
        return <li key={idx} className="ml-4 text-gray-700 dark:text-gray-300 list-decimal">{line.replace(/^\d+\. /, '')}</li>
      }
      if (line.trim()) {
        return <p key={idx} className="text-gray-700 dark:text-gray-300 leading-relaxed">{line}</p>
      }
      return null
    })
  }

  const renderContentBlock = (block: BlogContentBlock, index: number): React.ReactNode => {
    if (block.type === 'heading') {
      if (block.level === 1) {
        return <h1 key={index} className="text-3xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100">{block.text}</h1>
      }
      if (block.level === 2) {
        return <h2 key={index} className="text-2xl font-bold mt-5 mb-2 text-gray-900 dark:text-gray-100">{block.text}</h2>
      }
      return <h3 key={index} className="text-xl font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">{block.text}</h3>
    }

    if (block.type === 'paragraph') {
      return <p key={index} className="text-gray-700 dark:text-gray-300 leading-relaxed">{block.text}</p>
    }

    if (block.type === 'list') {
      const ListTag = block.ordered ? 'ol' : 'ul'
      const listClass = block.ordered
        ? 'list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300'
        : 'list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300'

      return (
        <ListTag key={index} className={listClass}>
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{item}</li>
          ))}
        </ListTag>
      )
    }

    if (block.type === 'image') {
      return (
        <figure key={index} className="space-y-2">
          <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <Image src={resolveImageSrc(block.src)} alt={block.alt} fill className="object-cover" />
          </div>
          {block.caption && (
            <figcaption className="text-sm text-gray-600 dark:text-gray-300">{block.caption}</figcaption>
          )}
        </figure>
      )
    }

    if (block.type === 'gallery') {
      return (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {block.images.map((image, imageIndex) => (
            <figure key={`${index}-${imageIndex}`} className="space-y-2">
              <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <Image src={resolveImageSrc(image.src)} alt={image.alt} fill className="object-cover" />
              </div>
              {image.caption && (
                <figcaption className="text-sm text-gray-600 dark:text-gray-300">{image.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )
    }

    if (block.type === 'quote') {
      return (
        <blockquote key={index} className="rounded-lg border-l-4 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 text-gray-800 dark:text-gray-200">
          <p className="italic">{block.text}</p>
          {block.author && <footer className="mt-2 text-sm text-gray-600 dark:text-gray-300">- {block.author}</footer>}
        </blockquote>
      )
    }

    return null
  }

  return (
    <main className="w-full px-4 py-4 md:py-8 text-gray-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto">
        <Link href="/blog" className="text-indigo-600 hover:underline text-sm mb-3 md:mb-4 inline-block">
          ← {t('blog.backToBlog')}
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 md:gap-8 xl:gap-10">
          <article>
            <div className="mb-3 md:mb-4 flex gap-2 flex-wrap">
              <Badge variant="outline" className="h-8 px-3 text-xs font-medium text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700">{t('blog.topicLabel')}: {t(categoryKeyMap[localizedPost.category] ?? localizedPost.category, localizedPost.category)}</Badge>
              {relatedCatalogCategory && (
                <Button variant="default" size="sm" asChild className="h-8 px-3 text-xs font-medium transition-transform hover:scale-105">
                  <a href={`/catalog?cat=${relatedCatalogCategory}`}>
                    {t('blog.relatedProducts')} →
                  </a>
                </Button>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4 leading-tight text-gray-900 dark:text-gray-100">{localizedPost.title}</h1>

            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-4 md:mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1 font-medium text-gray-700 dark:text-gray-300">
                👤 {localizedPost.author}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-gray-700 dark:text-gray-300">
                <CalendarDays className="h-4 w-4" />
                {formattedPublishedAt}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-gray-700 dark:text-gray-300">
                <Clock3 className="h-4 w-4" />
                {localizedPost.readTime} {t('blog.readTime')}
              </span>
              {hasUpdatedAt && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-gray-700 dark:text-gray-300">
                  {t('blog.updatedAt')}: {formattedUpdatedAt}
                </span>
              )}
            </div>

            <div className="relative aspect-video rounded-lg overflow-hidden mb-4 md:mb-6">
              <Image
                src={resolveImageSrc(localizedPost.image)}
                alt={localizedPost.title}
                fill
                className="object-cover"
              />
            </div>

            <div className="prose prose-sm max-w-none mb-10 md:mb-12 dark:prose-invert">
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed space-y-4">
                {localizedPost.contentBlocks && localizedPost.contentBlocks.length > 0
                  ? localizedPost.contentBlocks.map((block, index) => renderContentBlock(block, index))
                  : markdownToHtml(localizedPost.content)}
              </div>
            </div>

            <div className="border-t border-b border-gray-200 dark:border-gray-700 py-5 md:py-6 my-6 md:my-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xl md:text-2xl">
                  👤
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">{localizedPost.author}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{t('blog.articleAuthor')}</p>
                </div>
              </div>
            </div>

            {relatedPosts.length > 0 && (
              <section className="mt-12 md:mt-16 xl:hidden">
                <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-gray-900 dark:text-gray-100">{t('blog.relatedPosts')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {relatedPosts.map((relatedPost) => (
                    <BlogCard key={relatedPost.id} post={relatedPost} />
                  ))}
                </div>
              </section>
            )}
          </article>

          <aside className="xl:sticky xl:top-[var(--header-offset)] self-start space-y-5 md:space-y-6 xl:max-h-[calc(100vh-var(--header-offset)-16px)] xl:overflow-y-auto xl:pr-1">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 md:p-4 bg-white dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{t('blog.shareArticle')}:</p>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={toggleSaved}>
                  {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {isSaved ? t('blog.savedToFavorites') : t('blog.saveToFavorites')}
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" asChild className="h-8 px-3 text-xs">
                  <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer">📘 Facebook</a>
                </Button>
                <Button variant="outline" size="sm" asChild className="h-8 px-3 text-xs">
                  <a href={shareLinks.x} target="_blank" rel="noopener noreferrer">𝕏 Twitter</a>
                </Button>
                <Button variant="outline" size="sm" asChild className="h-8 px-3 text-xs">
                  <a href={shareLinks.telegram} target="_blank" rel="noopener noreferrer">💬 Telegram</a>
                </Button>
                <Button variant="outline" size="sm" asChild className="h-8 px-3 text-xs">
                  <a href={shareLinks.email}>📧 Email</a>
                </Button>
            </div>
            </section>

            {relatedPosts.length > 0 && (
              <section className="hidden xl:block">
                <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{t('blog.relatedPosts')}</h2>
                <div className="space-y-4">
                  {relatedPosts.map((relatedPost) => (
                    <BlogCard key={relatedPost.id} post={relatedPost} />
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
