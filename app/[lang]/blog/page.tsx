import React from 'react'
import { localizeBlogPost } from '@/data/blog'
import BlogCard from '@/components/BlogCard'
import BlogSubscribeForm from '@/components/BlogSubscribeForm'
import Reveal from '@/components/ui/Reveal'
import { getBlogPosts } from '@/lib/blog-store'
import { getServerContent } from '@/lib/server-translation'
import { getSiteUrl } from '@/lib/site-url'
import { localizePath, resolveLanguage } from '@/lib/i18n-routing'
import { resolveBlogCategoryKey } from '@/lib/blog-category'
import { serializeJsonLd } from '@/lib/json-ld'

type PageProps = { params: Promise<{ lang: string }> }

export const revalidate = 3600

export default async function BlogPage({ params }: PageProps): Promise<React.ReactElement> {
  const language = resolveLanguage((await params).lang)
  const [{ t }, posts] = await Promise.all([getServerContent(language), getBlogPosts()])
  const localizedPosts = posts.map((post) => localizeBlogPost(post, language))
  const featuredPosts = localizedPosts.filter((post) => post.featured)
  const regularPosts = localizedPosts.filter((post) => !post.featured).slice(0, 100)
  const categories = [...new Set(localizedPosts.map((post) => post.category))]
  const siteUrl = getSiteUrl()
  const blogUrl = `${siteUrl}${localizePath('/blog', language)}`

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('nav.home'), item: `${siteUrl}${localizePath('/', language)}` },
      { '@type': 'ListItem', position: 2, name: t('nav.blog'), item: blogUrl },
    ],
  }

  const blogCollectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${blogUrl}#collection`,
    name: t('blog.pageName'),
    url: blogUrl,
    description: t('blog.pageTitle'),
    isPartOf: { '@id': `${siteUrl}/#website` },
    mainEntity: {
      '@type': 'Blog',
      '@id': `${blogUrl}#blog`,
      name: t('blog.pageName'),
      url: blogUrl,
      publisher: { '@id': `${siteUrl}/#organization` },
      blogPost: localizedPosts.map((post) => {
        const categoryKey = resolveBlogCategoryKey(post.category, t)
        return {
          '@type': 'BlogPosting',
          '@id': `${siteUrl}${localizePath(`/blog/${post.slug}`, language)}#article`,
          headline: post.title,
          description: post.excerpt,
          articleSection: categoryKey ? t(categoryKey) : post.category,
          url: `${siteUrl}${localizePath(`/blog/${post.slug}`, language)}`,
          image: /^https?:\/\//i.test(post.image) ? post.image : `${siteUrl}${post.image}`,
          datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
          dateModified: (post.updatedAt ?? post.publishedAt ?? post.createdAt).toISOString(),
          author: {
            '@type': 'Person',
            name: post.author,
            ...(post.authorRole ? { jobTitle: post.authorRole } : {}),
          },
          publisher: { '@id': `${siteUrl}/#organization` },
        }
      }),
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogCollectionSchema) }} />
      <div className="w-full px-4 py-8 md:py-12">
        <section className="mb-8 md:mb-12">
          <h1 className="text-2xl font-bold text-foreground md:text-4xl">{t('blog.pageTitle')}</h1>
        </section>

        {categories.length > 0 && (
          <section className="mb-8 md:mb-12" aria-labelledby="blog-categories-heading">
            <h2 id="blog-categories-heading" className="mb-4 text-lg font-semibold text-foreground">
              {t('blog.categories')}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const categoryKey = resolveBlogCategoryKey(category, t)
                return (
                  <li key={category} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium">
                    #{categoryKey ? t(categoryKey) : category}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {featuredPosts.length > 0 && (
          <section className="mb-8 md:mb-12">
            <h2 className="mb-4 text-xl font-bold text-foreground md:mb-6 md:text-2xl">
              ⭐ {t('blog.featuredArticles')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              {featuredPosts.map((post, index) => (
                <Reveal key={post.id} index={index}><BlogCard post={post} /></Reveal>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-xl font-bold text-foreground md:mb-6 md:text-2xl">
            {t('blog.allPosts')} ({localizedPosts.length})
          </h2>
          {regularPosts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {regularPosts.map((post, index) => (
                <Reveal key={post.id} index={index}><BlogCard post={post} /></Reveal>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('common.noResults')}</p>
          )}
        </section>

        <section className="mt-12 rounded-lg bg-muted p-6 text-center md:mt-16 md:p-8">
          <h2 className="mb-3 text-xl font-bold text-foreground md:text-2xl">{t('blog.subscribeCtaTitle')}</h2>
          <p className="mb-6 text-muted-foreground">{t('blog.subscribeCtaDesc')}</p>
          <BlogSubscribeForm />
        </section>
      </div>
    </>
  )
}
