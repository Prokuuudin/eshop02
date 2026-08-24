'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import AdminGate from '@/components/admin/AdminGate';
import { logout } from '@/lib/auth';

import { useAdminBlogPage } from './useAdminBlogPage';

export default function AdminBlogPage(): React.ReactElement {
    const pageState = useAdminBlogPage();
    const {
        router,
        t,
        l,
        tl,
        locale,
        blogPosts,
        blogLoading,
        blogSaving,
        blogMessage,
        blogError,
        blogForm,
        setBlogForm,
        editingBlogId,
        handleBlogCreate,
        handleBlogDelete,
        handleStartEditBlog,
        handleCancelBlogEdit,
    } = pageState;
    return (
        <AdminGate>
            <main className="admin-blog-page w-full py-4 text-foreground">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {tl(
                                'admin.blog.title',
                                'Управление блогом',
                                'Blog management',
                                'Bloga pārvaldība'
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tl(
                                'admin.blog.subtitle',
                                'Создание, редактирование и удаление статей',
                                'Create, edit, and delete posts',
                                'Rakstu izveide, rediģēšana un dzēšana'
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin">
                            <Button variant="outline">
                                {tl(
                                    'admin.blog.backToAdmin',
                                    'Назад в админ-панель',
                                    'Back to admin panel',
                                    'Atpakaļ uz administrēšanas paneli'
                                )}
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            onClick={() => {
                                logout();
                                router.push('/');
                            }}
                        >
                            {t('auth.logout')}
                        </Button>
                    </div>
                </div>

                <div className="bg-card rounded-lg border border-border p-6 mt-8">
                    <form
                        onSubmit={handleBlogCreate}
                        className={`mb-8 space-y-4 rounded-lg p-5 shadow-sm ${
                            editingBlogId
                                ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
                                : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                        }`}
                    >
                        <Tabs defaultValue="base">
                            <TabsList className="mb-4">
                                <TabsTrigger value="base">
                                    {l('Основное (RU)', 'Primary (RU)', 'Pamata (RU)')}
                                </TabsTrigger>
                                <TabsTrigger value="en">English</TabsTrigger>
                                <TabsTrigger value="lv">Latviešu</TabsTrigger>
                            </TabsList>

                            <TabsContent value="base">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label htmlFor="blog-slug" className="text-sm">
                                        <span className="block text-muted-foreground mb-1">
                                            Slug
                                        </span>
                                        <Input
                                            id="blog-slug"
                                            value={blogForm.slug}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    slug: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            placeholder="spring-skin-reset-checklist"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-category" className="text-sm">
                                        <span className="block text-muted-foreground mb-1">
                                            {l('Категория', 'Category', 'Kategorija')}
                                        </span>
                                        <Input
                                            id="blog-category"
                                            value={blogForm.category}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    category: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            placeholder={l(
                                                'уход за лицом',
                                                'facial care',
                                                'sejas kopšana'
                                            )}
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-title" className="text-sm md:col-span-2">
                                        <span className="block text-muted-foreground mb-1">
                                            {l('Заголовок', 'Title', 'Virsraksts')}
                                        </span>
                                        <Input
                                            id="blog-title"
                                            value={blogForm.title}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    title: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-excerpt" className="text-sm md:col-span-2">
                                        <span className="block text-muted-foreground mb-1">
                                            {l(
                                                'Краткое описание',
                                                'Short description',
                                                'Īss apraksts'
                                            )}
                                        </span>
                                        <Textarea
                                            id="blog-excerpt"
                                            value={blogForm.excerpt}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    excerpt: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[72px]"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-author" className="text-sm">
                                        <span className="block text-muted-foreground mb-1">
                                            {l('Автор', 'Author', 'Autors')}
                                        </span>
                                        <Input
                                            id="blog-author"
                                            value={blogForm.author}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    author: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-read-time" className="text-sm">
                                        <span className="block text-muted-foreground mb-1">
                                            {l(
                                                'Время чтения (мин)',
                                                'Reading time (min)',
                                                'Lasīšanas laiks (min)'
                                            )}
                                        </span>
                                        <Input
                                            id="blog-read-time"
                                            type="number"
                                            min={1}
                                            value={blogForm.readTime}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    readTime: Number(e.target.value),
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-image" className="text-sm md:col-span-2">
                                        <span className="block text-muted-foreground mb-1">
                                            {l(
                                                'Обложка (путь)',
                                                'Cover (path)',
                                                'Vāka attēls (ceļš)'
                                            )}
                                        </span>
                                        <Input
                                            id="blog-image"
                                            value={blogForm.image}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    image: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                            placeholder="/blog/default.jpg"
                                            required
                                        />
                                    </label>

                                    <label htmlFor="blog-content" className="text-sm md:col-span-2">
                                        <span className="block text-muted-foreground mb-1">
                                            {l(
                                                'Legacy content (опционально)',
                                                'Legacy content (optional)',
                                                'Mantotais saturs (neobligāts)'
                                            )}
                                        </span>
                                        <Textarea
                                            id="blog-content"
                                            value={blogForm.content}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    content: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[120px]"
                                            placeholder={l(
                                                '# Заголовок\n\nТекст...',
                                                '# Heading\n\nText...',
                                                '# Virsraksts\n\nTeksts...'
                                            )}
                                        />
                                    </label>

                                    <label
                                        htmlFor="blog-content-blocks"
                                        className="text-sm md:col-span-2"
                                    >
                                        <span className="block text-muted-foreground mb-1">
                                            contentBlocks JSON
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                heading·paragraph·list(ordered?)·quote(author?)·image(src,alt,caption?)·gallery
                                            </span>
                                        </span>
                                        <Textarea
                                            id="blog-content-blocks"
                                            value={blogForm.contentBlocksJson}
                                            onChange={(e) =>
                                                setBlogForm((prev) => ({
                                                    ...prev,
                                                    contentBlocksJson: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[220px] font-mono text-xs"
                                            placeholder='[{"type":"paragraph","text":"..."}]'
                                            required
                                        />
                                    </label>
                                </div>
                            </TabsContent>

                            {(['en', 'lv'] as const).map((lang) => (
                                <TabsContent key={lang} value={lang}>
                                    <p className="text-xs text-muted-foreground mb-4">
                                        {l(
                                            'Пустые поля наследуют значение из основной (RU) вкладки. Заполните только те поля, которые отличаются.',
                                            'Empty fields inherit the value from the primary (RU) tab. Fill in only the fields that differ.',
                                            'Tukšie lauki pārmanto vērtību no pamata (RU) cilnes. Aizpildiet tikai atšķirīgos laukus.'
                                        )}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <label className="text-sm md:col-span-2">
                                            <span className="block text-muted-foreground mb-1">
                                                {l('Заголовок', 'Title', 'Virsraksts')} ({lang})
                                            </span>
                                            <Input
                                                value={blogForm.translations[lang].title}
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                title: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                                placeholder={
                                                    blogForm.title ||
                                                    l(
                                                        `Заголовок на ${lang}`,
                                                        `Title in ${lang}`,
                                                        `Virsraksts ${lang} valodā`
                                                    )
                                                }
                                            />
                                        </label>

                                        <label className="text-sm md:col-span-2">
                                            <span className="block text-muted-foreground mb-1">
                                                {l(
                                                    'Краткое описание',
                                                    'Short description',
                                                    'Īss apraksts'
                                                )}{' '}
                                                ({lang})
                                            </span>
                                            <Textarea
                                                value={blogForm.translations[lang].excerpt}
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                excerpt: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[72px]"
                                                placeholder={
                                                    blogForm.excerpt ||
                                                    l(
                                                        `Описание на ${lang}`,
                                                        `Description in ${lang}`,
                                                        `Apraksts ${lang} valodā`
                                                    )
                                                }
                                            />
                                        </label>

                                        <label className="text-sm">
                                            <span className="block text-muted-foreground mb-1">
                                                {l('Автор', 'Author', 'Autors')} ({lang})
                                            </span>
                                            <Input
                                                value={blogForm.translations[lang].author}
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                author: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                                placeholder={blogForm.author || `Author (${lang})`}
                                            />
                                        </label>

                                        <label className="text-sm">
                                            <span className="block text-muted-foreground mb-1">
                                                {l('Категория', 'Category', 'Kategorija')} ({lang})
                                            </span>
                                            <Input
                                                value={blogForm.translations[lang].category}
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                category: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                                                placeholder={
                                                    blogForm.category || `Category (${lang})`
                                                }
                                            />
                                        </label>

                                        <label className="text-sm md:col-span-2">
                                            <span className="block text-muted-foreground mb-1">
                                                {l(
                                                    `Legacy content (${lang}, опционально)`,
                                                    `Legacy content (${lang}, optional)`,
                                                    `Mantotais saturs (${lang}, neobligāts)`
                                                )}
                                            </span>
                                            <Textarea
                                                value={blogForm.translations[lang].content}
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                content: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[120px]"
                                                placeholder="# Heading&#10;&#10;Text..."
                                            />
                                        </label>

                                        <label className="text-sm md:col-span-2">
                                            <span className="block text-muted-foreground mb-1">
                                                {l(
                                                    `contentBlocks JSON (${lang}, опционально)`,
                                                    `contentBlocks JSON (${lang}, optional)`,
                                                    `contentBlocks JSON (${lang}, neobligāts)`
                                                )}
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    heading·paragraph·list(ordered?)·quote(author?)·image(src,alt,caption?)·gallery
                                                </span>
                                            </span>
                                            <Textarea
                                                value={
                                                    blogForm.translations[lang].contentBlocksJson
                                                }
                                                onChange={(e) =>
                                                    setBlogForm((prev) => ({
                                                        ...prev,
                                                        translations: {
                                                            ...prev.translations,
                                                            [lang]: {
                                                                ...prev.translations[lang],
                                                                contentBlocksJson: e.target.value,
                                                            },
                                                        },
                                                    }))
                                                }
                                                className="w-full rounded border border-border bg-card text-foreground px-3 py-2 min-h-[220px] font-mono text-xs"
                                                placeholder='[{"type":"paragraph","text":"..."}]'
                                            />
                                        </label>
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={blogForm.featured}
                                onCheckedChange={(checked) =>
                                    setBlogForm((prev) => ({ ...prev, featured: checked === true }))
                                }
                            />
                            {tl(
                                'admin.blog.featuredToggle',
                                'Показать как featured',
                                'Mark as featured',
                                'Atzīmēt kā izceltu'
                            )}
                        </label>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={blogForm.status === 'published'}
                                onCheckedChange={(checked) =>
                                    setBlogForm((prev) => ({
                                        ...prev,
                                        status: checked === true ? 'published' : 'draft',
                                    }))
                                }
                            />
                            {tl(
                                'admin.blog.publishedToggle',
                                'Опубликовать статью',
                                'Publish post',
                                'Publicēt rakstu'
                            )}
                        </label>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="text-sm">
                                <span className="mb-1 block">
                                    {tl(
                                        'admin.blog.authorRole',
                                        'Должность автора',
                                        'Author role',
                                        'Autora amats'
                                    )}
                                </span>
                                <Input
                                    className="w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                    value={blogForm.authorRole}
                                    onChange={(event) =>
                                        setBlogForm((prev) => ({
                                            ...prev,
                                            authorRole: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                            <label className="text-sm">
                                <span className="mb-1 block">
                                    {tl(
                                        'admin.blog.authorBio',
                                        'Экспертность автора',
                                        'Author expertise',
                                        'Autora kompetence'
                                    )}
                                </span>
                                <Input
                                    className="w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                    value={blogForm.authorBio}
                                    onChange={(event) =>
                                        setBlogForm((prev) => ({
                                            ...prev,
                                            authorBio: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button type="submit" disabled={blogSaving}>
                                {blogSaving
                                    ? tl(
                                          'admin.blog.saving',
                                          'Сохранение...',
                                          'Saving...',
                                          'Saglabāšana...'
                                      )
                                    : editingBlogId
                                    ? tl(
                                          'admin.blog.updatePost',
                                          'Обновить статью',
                                          'Update post',
                                          'Atjaunot rakstu'
                                      )
                                    : tl(
                                          'admin.blog.savePost',
                                          'Сохранить статью',
                                          'Save post',
                                          'Saglabāt rakstu'
                                      )}
                            </Button>
                            {editingBlogId && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleCancelBlogEdit}
                                >
                                    {tl(
                                        'admin.blog.cancelEdit',
                                        'Отменить редактирование',
                                        'Cancel editing',
                                        'Atcelt rediģēšanu'
                                    )}
                                </Button>
                            )}
                            {blogMessage && (
                                <span className="text-sm text-green-700">{blogMessage}</span>
                            )}
                            {blogError && <span className="text-sm text-red-600">{blogError}</span>}
                        </div>
                    </form>

                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {tl(
                                'admin.blog.postsList',
                                'Список статей',
                                'Posts list',
                                'Rakstu saraksts'
                            )}
                        </h3>
                        {blogLoading ? (
                            <p className="text-muted-foreground">
                                {tl('admin.blog.loading', 'Загрузка...', 'Loading...', 'Ielāde...')}
                            </p>
                        ) : blogPosts.length === 0 ? (
                            <p className="text-muted-foreground">
                                {tl(
                                    'admin.blog.empty',
                                    'Статей пока нет',
                                    'No posts yet',
                                    'Rakstu vēl nav'
                                )}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {blogPosts.map((post) => (
                                    <div
                                        key={post.id}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border border-border p-3"
                                    >
                                        <div>
                                            <p className="font-medium">{post.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                /{post.slug} • {formatDate(post.createdAt, locale)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleStartEditBlog(post)}
                                            >
                                                {tl(
                                                    'admin.blog.edit',
                                                    'Редактировать',
                                                    'Edit',
                                                    'Rediģēt'
                                                )}
                                            </Button>
                                            <a
                                                href={`/blog/${post.slug}`}
                                                className="text-sm text-primary hover:underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {tl('admin.blog.open', 'Открыть', 'Open', 'Atvērt')}
                                            </a>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleBlogDelete(post.id)}
                                            >
                                                {tl(
                                                    'admin.blog.delete',
                                                    'Удалить',
                                                    'Delete',
                                                    'Dzēst'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </AdminGate>
    );
}
