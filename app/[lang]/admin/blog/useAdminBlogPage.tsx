'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/use-translation';

type AdminBlogPost = {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    author: string;
    image: string;
    category: string;
    readTime: number;
    content: string;
    contentBlocks?: unknown[];
    createdAt: string;
    featured?: boolean;
    status?: 'draft' | 'published';
    authorRole?: string;
    authorBio?: string;
    translations?: Partial<
        Record<
            'en' | 'lv',
            {
                title?: string;
                excerpt?: string;
                author?: string;
                category?: string;
                content?: string;
                contentBlocks?: unknown[];
            }
        >
    >;
};

type TranslationForm = {
    title: string;
    excerpt: string;
    author: string;
    category: string;
    content: string;
    contentBlocksJson: string;
};

const EMPTY_TRANSLATION: TranslationForm = {
    title: '',
    excerpt: '',
    author: '',
    category: '',
    content: '',
    contentBlocksJson: '',
};

type AdminBlogForm = {
    id?: string;
    slug: string;
    title: string;
    excerpt: string;
    author: string;
    image: string;
    category: string;
    readTime: number;
    content: string;
    featured: boolean;
    status: 'draft' | 'published';
    authorRole: string;
    authorBio: string;
    createdAt?: string;
    contentBlocksJson: string;
    translations: { en: TranslationForm; lv: TranslationForm };
};

const INITIAL_BLOG_FORM: AdminBlogForm = {
    id: undefined,
    slug: '',
    title: '',
    excerpt: '',
    author: '',
    image: '/blog/default.jpg',
    category: 'уход за лицом',
    readTime: 4,
    content: '',
    featured: false,
    status: 'draft',
    authorRole: '',
    authorBio: '',
    createdAt: undefined,
    contentBlocksJson: '[]',
    translations: { en: { ...EMPTY_TRANSLATION }, lv: { ...EMPTY_TRANSLATION } },
};

function useAdminBlogPageState() {
    const router = useRouter();
    const { language, t } = useTranslation();
    const l = useCallback(
        (ru: string, en: string, lv: string) =>
            language === 'ru' ? ru : language === 'lv' ? lv : en,
        [language]
    );
    const tl = useCallback(
        (
            key: string,
            ru: string,
            en: string,
            lv: string,
            params?: Record<string, string | number>
        ) => t(key, l(ru, en, lv), params),
        [l, t]
    );
    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';

    const [blogPosts, setBlogPosts] = useState<AdminBlogPost[]>([]);
    const [blogLoading, setBlogLoading] = useState(false);
    const [blogSaving, setBlogSaving] = useState(false);
    const [blogMessage, setBlogMessage] = useState('');
    const [blogError, setBlogError] = useState('');
    const [blogForm, setBlogForm] = useState<AdminBlogForm>(INITIAL_BLOG_FORM);
    const [editingBlogId, setEditingBlogId] = useState<string | null>(null);

    const loadBlogPosts = useCallback(async (): Promise<void> => {
        setBlogLoading(true);
        setBlogError('');
        try {
            const response = await fetch('/api/admin/blog', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('failed_to_load_blog_posts');
            }

            const data = (await response.json()) as { posts?: AdminBlogPost[] };
            setBlogPosts(data.posts ?? []);
        } catch {
            setBlogError(
                tl(
                    'admin.blog.msg.loadFailed',
                    'Не удалось загрузить статьи блога',
                    'Failed to load blog posts',
                    'Neizdevas ieladet bloga rakstus'
                )
            );
        } finally {
            setBlogLoading(false);
        }
    }, [tl]);

    useEffect(() => {
        queueMicrotask(() => void loadBlogPosts());
    }, [loadBlogPosts]);

    const handleBlogCreate = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        setBlogSaving(true);
        setBlogError('');
        setBlogMessage('');

        try {
            let contentBlocks: unknown[];
            try {
                contentBlocks = JSON.parse(blogForm.contentBlocksJson) as unknown[];
            } catch (parseError) {
                if (parseError instanceof Error) {
                    setBlogError(
                        tl(
                            'admin.blog.msg.invalidJsonWithReason',
                            'Невалидный JSON: {reason}',
                            'Invalid JSON: {reason}',
                            'Nederigs JSON: {reason}',
                            { reason: parseError.message }
                        )
                    );
                    return;
                }
                setBlogError(
                    tl(
                        'admin.blog.msg.invalidJson',
                        'Невалидный JSON в contentBlocks',
                        'Invalid JSON in contentBlocks',
                        'Nederigs JSON lauka contentBlocks'
                    )
                );
                return;
            }

            if (!Array.isArray(contentBlocks)) {
                setBlogError(
                    tl(
                        'admin.blog.msg.contentBlocksArray',
                        'contentBlocks JSON должен быть массивом блоков',
                        'contentBlocks JSON must be an array of blocks',
                        'contentBlocks JSON jabut bloku masivam'
                    )
                );
                return;
            }

            const translationsPayload: Partial<Record<'en' | 'lv', Record<string, unknown>>> = {};
            for (const lang of ['en', 'lv'] as const) {
                const tr = blogForm.translations[lang];
                const hasAnyText = tr.title || tr.excerpt || tr.author || tr.category || tr.content;
                let trContentBlocks: unknown[] | undefined;

                if (tr.contentBlocksJson.trim()) {
                    let parsedTr: unknown;
                    try {
                        parsedTr = JSON.parse(tr.contentBlocksJson);
                    } catch (parseError) {
                        setBlogError(
                            `Невалидный JSON (${lang} contentBlocks): ${
                                parseError instanceof Error ? parseError.message : ''
                            }`
                        );
                        return;
                    }
                    if (!Array.isArray(parsedTr)) {
                        setBlogError(`${lang} contentBlocks JSON должен быть массивом блоков`);
                        return;
                    }
                    if (parsedTr.length > 0) trContentBlocks = parsedTr;
                }

                if (hasAnyText || trContentBlocks) {
                    translationsPayload[lang] = {
                        ...(tr.title ? { title: tr.title } : {}),
                        ...(tr.excerpt ? { excerpt: tr.excerpt } : {}),
                        ...(tr.author ? { author: tr.author } : {}),
                        ...(tr.category ? { category: tr.category } : {}),
                        ...(tr.content ? { content: tr.content } : {}),
                        ...(trContentBlocks ? { contentBlocks: trContentBlocks } : {}),
                    };
                }
            }

            const payload = {
                id: blogForm.id,
                slug: blogForm.slug,
                title: blogForm.title,
                excerpt: blogForm.excerpt,
                author: blogForm.author,
                image: blogForm.image,
                category: blogForm.category,
                readTime: Number(blogForm.readTime),
                content: blogForm.content,
                featured: blogForm.featured,
                status: blogForm.status,
                authorRole: blogForm.authorRole,
                authorBio: blogForm.authorBio,
                createdAt: blogForm.createdAt,
                contentBlocks,
                translations:
                    Object.keys(translationsPayload).length > 0 ? translationsPayload : undefined,
            };

            const response = await fetch('/api/admin/blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(data.error ?? 'save_failed');
            }

            setBlogMessage(
                editingBlogId
                    ? tl(
                          'admin.blog.msg.updated',
                          'Статья обновлена',
                          'Post updated',
                          'Raksts atjauninats'
                      )
                    : tl(
                          'admin.blog.msg.saved',
                          'Статья сохранена',
                          'Post saved',
                          'Raksts saglabats'
                      )
            );
            setBlogForm(INITIAL_BLOG_FORM);
            setEditingBlogId(null);
            await loadBlogPosts();
        } catch (saveError) {
            const reason =
                saveError instanceof Error
                    ? saveError.message
                    : tl(
                          'admin.blog.msg.saveFailed',
                          'Ошибка сохранения',
                          'Save failed',
                          'Saglabasana neizdevas'
                      );
            setBlogError(
                tl(
                    'admin.blog.msg.saveFailedWithReason',
                    'Ошибка сохранения: {reason}',
                    'Save error: {reason}',
                    'Saglabasanas kluda: {reason}',
                    { reason }
                )
            );
        } finally {
            setBlogSaving(false);
        }
    };

    const handleBlogDelete = async (id: string): Promise<void> => {
        setBlogError('');
        setBlogMessage('');

        try {
            const response = await fetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                throw new Error('delete_failed');
            }

            setBlogMessage(
                tl('admin.blog.msg.deleted', 'Статья удалена', 'Post deleted', 'Raksts dzests')
            );
            if (editingBlogId === id) {
                setEditingBlogId(null);
                setBlogForm(INITIAL_BLOG_FORM);
            }
            await loadBlogPosts();
        } catch {
            setBlogError(
                tl(
                    'admin.blog.msg.deleteFailed',
                    'Не удалось удалить статью',
                    'Failed to delete post',
                    'Neizdevas dzest rakstu'
                )
            );
        }
    };

    const handleStartEditBlog = (post: AdminBlogPost): void => {
        setEditingBlogId(post.id);
        setBlogMessage('');
        setBlogError('');

        const getTranslationForm = (lang: 'en' | 'lv'): TranslationForm => {
            const tr = post.translations?.[lang];
            if (!tr) return { ...EMPTY_TRANSLATION };
            return {
                title: tr.title ?? '',
                excerpt: tr.excerpt ?? '',
                author: tr.author ?? '',
                category: tr.category ?? '',
                content: tr.content ?? '',
                contentBlocksJson:
                    Array.isArray(tr.contentBlocks) && tr.contentBlocks.length > 0
                        ? JSON.stringify(tr.contentBlocks, null, 2)
                        : '',
            };
        };

        setBlogForm({
            id: post.id,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            author: post.author,
            image: post.image,
            category: post.category,
            readTime: post.readTime,
            content: post.content,
            featured: Boolean(post.featured),
            status: post.status === 'draft' ? 'draft' : 'published',
            authorRole: post.authorRole ?? '',
            authorBio: post.authorBio ?? '',
            createdAt: post.createdAt,
            contentBlocksJson: JSON.stringify(post.contentBlocks ?? [], null, 2),
            translations: { en: getTranslationForm('en'), lv: getTranslationForm('lv') },
        });
    };

    const handleCancelBlogEdit = (): void => {
        setEditingBlogId(null);
        setBlogForm(INITIAL_BLOG_FORM);
        setBlogMessage('');
        setBlogError('');
    };

    return {
        router,
        language,
        t,
        l,
        tl,
        locale,
        blogPosts,
        setBlogPosts,
        blogLoading,
        setBlogLoading,
        blogSaving,
        setBlogSaving,
        blogMessage,
        setBlogMessage,
        blogError,
        setBlogError,
        blogForm,
        setBlogForm,
        editingBlogId,
        setEditingBlogId,
        loadBlogPosts,
        handleBlogCreate,
        handleBlogDelete,
        handleStartEditBlog,
        handleCancelBlogEdit,
    };
}

export function useAdminBlogPage(): ReturnType<typeof useAdminBlogPageState> {
  return useAdminBlogPageState()
}
