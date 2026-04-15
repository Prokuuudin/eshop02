'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BlogPost, localizeBlogPost } from '@/data/blog'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/use-translation'
import { formatDate, getLocaleFromLanguage } from '@/lib/utils'

type BlogCardProps = {
  post: BlogPost
}

export default function BlogCard({ post }: BlogCardProps) {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const localizedPost = localizeBlogPost(post, language)
  const categoryKeyMap: Record<string, string> = {
    'уход за лицом': 'blog.category.faceCare',
    'уход за волосами': 'blog.category.hairCare',
    'уход за телом': 'blog.category.bodyCare',
    'макияж': 'blog.category.makeup',
    'ингредиенты': 'blog.category.ingredients'
  }

  return (
    <article className="blog-card bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
      <Link href={`/blog/${localizedPost.slug}`}>
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          <Image
            src={localizedPost.image}
            alt={localizedPost.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {localizedPost.featured && (
            <div className="absolute top-3 left-3">
              <Badge className="bg-red-600 text-white">{t('blog.featured')}</Badge>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3 md:p-4">
        <div className="flex gap-1.5 md:gap-2 mb-2 flex-wrap items-center">
          <Badge variant="outline" className="h-7 px-2 text-[11px] font-medium text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700">{t('blog.topicLabel')}: {t(categoryKeyMap[localizedPost.category] ?? localizedPost.category, localizedPost.category)}</Badge>
          <span className="text-xs text-gray-500 dark:text-gray-300">⏱ {localizedPost.readTime} {t('blog.readTimeShort')}</span>
        </div>

        <Link href={`/blog/${localizedPost.slug}`}>
          <h3 className="font-bold text-base md:text-lg text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition line-clamp-2 leading-snug break-words min-h-[2.75rem] md:min-h-[3.25rem]">{localizedPost.title}</h3>
        </Link>

        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 md:mt-2 line-clamp-2 leading-snug break-words min-h-[2.5rem]">{localizedPost.excerpt}</p>

        <div className="flex justify-between items-center mt-3 md:mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 min-h-[2rem]">
          <span className="truncate pr-2">{localizedPost.author}</span>
          <span>{formatDate(localizedPost.createdAt, locale)}</span>
        </div>
      </div>
    </article>
  )
}
