'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BlogPost, localizeBlogPost } from '@/data/blog';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/use-translation';
import { useSiteContent } from '@/lib/use-site-content';
import { formatDate, getLocaleFromLanguage } from '@/lib/utils';
import type { Language } from '@/data/translations';
import { resolveBlogCategoryKey } from '@/lib/blog-category';
import { localizePath } from '@/lib/i18n-routing';

type BlogCardProps = {
    post: BlogPost;
};

export default function BlogCard({ post }: BlogCardProps): React.ReactElement {
    const { t, language } = useTranslation();
    const { resolveImageSrc } = useSiteContent();
    const locale = getLocaleFromLanguage(language);
    // Нормализация языка до двухбуквенного кода
    const shortLang = language.split('-')[0];
    const localizedPost = localizeBlogPost(post, shortLang as Language);
    const categoryKey =
        resolveBlogCategoryKey(localizedPost.category, t) ??
        resolveBlogCategoryKey(post.category, t);
    const postHref = localizePath(`/blog/${localizedPost.slug}`, shortLang as Language);

    return (
        <article className="blog-card bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
            <Link href={postHref}>
                <div className="relative aspect-video bg-gray-100 overflow-hidden">
                    <Image
                        src={resolveImageSrc(localizedPost.image)}
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
                    <Badge
                        variant="outline"
                        className="h-7 px-2 text-[11px] font-medium text-foreground border-border"
                    >
                        {t('blog.topicLabel')}:{' '}
                        {categoryKey ? t(categoryKey) : localizedPost.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        ⏱ {localizedPost.readTime} {t('blog.readTimeShort')}
                    </span>
                </div>

                <Link href={postHref}>
                    <h3 className="font-bold text-base md:text-lg text-foreground group-hover:text-primary transition line-clamp-2 leading-snug break-words min-h-[2.75rem] md:min-h-[3.25rem]">
                        {localizedPost.title}
                    </h3>
                </Link>

                <p className="text-sm text-muted-foreground mt-1.5 md:mt-2 line-clamp-2 leading-snug break-words min-h-[2.5rem]">
                    {localizedPost.excerpt}
                </p>

                <div className="flex justify-between items-center mt-3 md:mt-4 pt-3 border-t border-border text-xs text-muted-foreground min-h-[2rem]">
                    <span className="truncate pr-2">{localizedPost.author}</span>
                    <span>{formatDate(localizedPost.createdAt, locale)}</span>
                </div>
            </div>
        </article>
    );
}
