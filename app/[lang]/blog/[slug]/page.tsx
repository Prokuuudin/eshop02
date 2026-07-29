import React from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { localizeBlogPost } from '@/data/blog';
import BlogPostContent from '@/components/BlogPostContent';
import { getSiteUrl } from '@/lib/site-url';
import { getBlogPostBySlug, getBlogPosts } from '@/lib/blog-store';
import { DEFAULT_LANGUAGE, pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing';
import { serializeJsonLd } from '@/lib/json-ld';

type Params = {
    lang: string;
    slug: string;
};

type PageProps = {
    params: Promise<Params>;
};

export const revalidate = 3600;

// Prerender only the default language at build time; /en and /lv versions are
// built on demand via ISR.
export async function generateStaticParams(): Promise<Params[]> {
    const posts = await getBlogPosts();
    return posts.map((post) => ({
        lang: DEFAULT_LANGUAGE,
        slug: post.slug,
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug, lang } = await params;
    const post = await getBlogPostBySlug(slug);
    const language = resolveLanguage(lang);
    if (!post) {
        return {
            title: 'Article not found | Hairshop-Pro',
            description: 'Requested article was not found',
            robots: {
                index: false,
                follow: false,
            },
        };
    }

    const localizedPost = localizeBlogPost(post, language);

    const path = `/blog/${localizedPost.slug}`;

    return {
        title: `${localizedPost.title} | Hairshop-Pro`,
        description: localizedPost.excerpt,
        openGraph: {
            title: `${localizedPost.title} | Hairshop-Pro`,
            description: localizedPost.excerpt,
            images: [{ url: localizedPost.image, alt: localizedPost.title }],
            url: localizePath(path, language),
            type: 'article',
        },
        alternates: pageAlternates(path, language),
    };
}

export default async function BlogPostPage({ params }: PageProps): Promise<React.ReactElement> {
    const { slug, lang } = await params;
    const language = resolveLanguage(lang);
    const post = await getBlogPostBySlug(slug);

    if (!post) {
        notFound();
    }

    const allPosts = await getBlogPosts();
    const relatedPosts = allPosts
        .filter((p) => p.category === post.category && p.id !== post.id)
        .slice(0, 3);

    const siteUrl = getSiteUrl();
    const postUrl = `${siteUrl}${localizePath(`/blog/${post.slug}`, language)}`;

    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: language === 'ru' ? 'Главная' : language === 'lv' ? 'Sākums' : 'Home',
                item: `${siteUrl}${localizePath('/', language)}`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: language === 'ru' ? 'Блог' : language === 'lv' ? 'Blogs' : 'Blog',
                item: `${siteUrl}${localizePath('/blog', language)}`,
            },
            { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
        ],
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
            />
            <BlogPostContent post={post} relatedPosts={relatedPosts} postUrl={postUrl} />
        </>
    );
}
