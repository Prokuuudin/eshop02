"use client"
import React from 'react'
import Link from 'next/link'
import { localizeBlogPost, type BlogPost } from '@/data/blog'
import BlogCard from '@/components/BlogCard'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import { getSiteUrl } from '@/lib/site-url'

export default function BlogPage() {
  const { t, language } = useTranslation()
  const [posts, setPosts] = React.useState<BlogPost[]>([])
  const [loading, setLoading] = React.useState(true)
  const [subscribeEmail, setSubscribeEmail] = React.useState('')
  const [subscribeError, setSubscribeError] = React.useState('')
  const [subscribeSuccess, setSubscribeSuccess] = React.useState(false)

  const validateEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleSubscribe = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    setSubscribeError('')
    setSubscribeSuccess(false)

    if (!validateEmail(subscribeEmail)) {
      setSubscribeError('Введите корректный email')
      return
    }

    setSubscribeSuccess(true)
    setSubscribeEmail('')
  }

  React.useEffect(() => {
    let active = true

    const loadPosts = async () => {
      try {
        const response = await fetch('/api/blog', { cache: 'no-store' })
        if (!response.ok) return
        const data = (await response.json()) as { posts?: Array<BlogPost & { createdAt: string; updatedAt?: string }> }
        if (!active) return

        const nextPosts = (data.posts ?? []).map((post) => ({
          ...post,
          createdAt: new Date(post.createdAt),
          updatedAt: post.updatedAt ? new Date(post.updatedAt) : undefined
        }))

        setPosts(nextPosts)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadPosts()

    return () => {
      active = false
    }
  }, [])

  const localizedPosts = React.useMemo(
    () => posts.map((post) => localizeBlogPost(post, language)),
    [language, posts]
  )
  const featuredPosts = localizedPosts.filter((p) => p.featured)
  const regularPosts = localizedPosts.filter((p) => !p.featured).slice(0, 100)
  const categories = [...new Set(localizedPosts.map((p) => p.category))]
  const siteUrl = getSiteUrl()

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('nav.home'), item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: t('nav.blog'), item: `${siteUrl}/blog` }
    ]
  }

  const categoryKeyMap: Record<string, string> = {
    'уход за лицом': 'blog.category.faceCare',
    'уход за волосами': 'blog.category.hairCare',
    'уход за телом': 'blog.category.bodyCare',
    'макияж': 'blog.category.makeup',
    'ингредиенты': 'blog.category.ingredients'
  }

  const blogCollectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('blog.pageName'),
    url: `${siteUrl}/blog`,
    description: t('blog.pageTitle'),
    mainEntity: {
      '@type': 'Blog',
      name: t('blog.pageName'),
      blogPost: localizedPosts.map((post) => {
        const localizedCategory = t(categoryKeyMap[post.category] ?? post.category, post.category)

        return {
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          articleSection: `${t('blog.topicLabel')}: ${localizedCategory}`,
          url: `${siteUrl}/blog/${post.slug}`,
          image: `${siteUrl}${post.image}`,
          datePublished: post.createdAt.toISOString(),
          author: {
            '@type': 'Person',
            name: post.author
          }
        }
      })
    }
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogCollectionSchema) }} />
      <main className="w-full px-4 py-8 md:py-12">
        <section className="mb-8 md:mb-12">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">
            {t('blog.pageTitle')}
          </h1>
        </section>

        {/* Categories */}
        <section className="mb-8 md:mb-12">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('blog.categories')}</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Button key={cat} variant="outline" size="sm" className="h-8 px-3 text-xs font-medium">
                #{t(categoryKeyMap[cat] ?? cat, cat)}
              </Button>
            ))}
          </div>
        </section>

        {/* Featured Posts */}
        {!loading && featuredPosts.length > 0 && (
          <section className="mb-8 md:mb-12">
            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-gray-900 dark:text-gray-100">⭐ {t('blog.featuredArticles')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {featuredPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        {/* All Posts */}
        <section>
          <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-gray-900 dark:text-gray-100">{t('blog.allPosts')} ({localizedPosts.length})</h2>
          {loading ? (
            <p className="text-gray-600 dark:text-gray-300">{t('common.loading')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {regularPosts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </section>

        {/* Subscribe CTA */}
        <section className="mt-12 md:mt-16 bg-gray-50 dark:bg-gray-800 rounded-lg p-6 md:p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('blog.subscribeCtaTitle')}</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{t('blog.subscribeCtaDesc')}</p>
          <form onSubmit={handleSubscribe} className="mx-auto max-w-xl flex flex-col sm:flex-row gap-2">
            <input
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              placeholder={t('newsletter.placeholder')}
              value={subscribeEmail}
              onChange={(e) => setSubscribeEmail(e.target.value)}
              aria-label={t('newsletter.emailAria')}
            />
            <Button size="lg" type="submit">{t('blog.subscribe')}</Button>
          </form>
          {subscribeError && <p className="mt-3 text-sm text-red-600">{subscribeError}</p>}
          {subscribeSuccess && <p className="mt-3 text-sm text-green-700">{t('newsletter.subscribed')}</p>}
        </section>
      </main>
    </>
  )
}
