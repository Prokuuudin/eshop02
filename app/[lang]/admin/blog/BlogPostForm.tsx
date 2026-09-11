'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import BlogImageField from '@/components/admin/blog/BlogImageField';
import BlogContentBlocksEditor from '@/components/admin/blog/BlogContentBlocksEditor';
import BlogRelatedProductsPicker from '@/components/admin/blog/BlogRelatedProductsPicker';
import type { useAdminBlogPage } from './useAdminBlogPage';
import BlogTranslationTabs from './BlogTranslationTabs';

type State = ReturnType<typeof useAdminBlogPage>;

export default function BlogPostForm({ state }: { state: State }): React.ReactElement {
    const {
        l,
        tl,
        blogSaving,
        blogMessage,
        blogError,
        blogForm,
        setBlogForm,
        editingBlogId,
        handleBlogCreate,
        handleCancelBlogEdit,
    } = state;
    const showLegacyContent = Boolean(editingBlogId && blogForm.content.trim());

    return (
        <form
            onSubmit={handleBlogCreate}
            className={`mb-8 space-y-3 rounded-lg p-4 shadow-sm ${
                editingBlogId
                    ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
                    : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
            }`}
        >
            <Tabs defaultValue="base">
                <TabsList className="mb-3">
                    <TabsTrigger value="base">
                        {l('Основное (RU)', 'Primary (RU)', 'Pamata (RU)')}
                    </TabsTrigger>
                    <TabsTrigger value="en">English</TabsTrigger>
                    <TabsTrigger value="lv">Latviešu</TabsTrigger>
                </TabsList>

                <TabsContent value="base">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
                        <label
                            htmlFor="blog-title"
                            className="text-sm sm:col-span-2 lg:col-span-12"
                        >
                            <span className="mb-1 block text-muted-foreground">
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
                                className="w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                required
                            />
                        </label>

                        <label htmlFor="blog-slug" className="text-sm lg:col-span-4">
                            <span className="block text-muted-foreground mb-1">Slug</span>
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

                        <label htmlFor="blog-category" className="text-sm lg:col-span-4">
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
                                placeholder={l('уход за лицом', 'facial care', 'sejas kopšana')}
                                required
                            />
                        </label>

                        <label htmlFor="blog-author" className="text-sm lg:col-span-3">
                            <span className="mb-1 block text-muted-foreground">
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
                                className="w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                required
                            />
                        </label>

                        <label htmlFor="blog-read-time" className="text-sm lg:col-span-1">
                            <span className="mb-1 block whitespace-nowrap text-muted-foreground">
                                {l('Минут', 'Minutes', 'Minūtes')}
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
                                className="w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                aria-label={l(
                                    'Время чтения в минутах',
                                    'Reading time in minutes',
                                    'Lasīšanas laiks minūtēs'
                                )}
                                required
                            />
                        </label>

                        <label
                            htmlFor="blog-excerpt"
                            className="text-sm sm:col-span-2 lg:col-span-12"
                        >
                            <span className="block text-muted-foreground mb-1">
                                {l('Краткое описание', 'Short description', 'Īss apraksts')}
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
                                className="min-h-[64px] w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                required
                            />
                        </label>

                        <BlogImageField
                            id="blog-image"
                            label={l('Обложка', 'Cover image', 'Vāka attēls')}
                            value={blogForm.image}
                            onChange={(path) => setBlogForm((prev) => ({ ...prev, image: path }))}
                            l={l}
                            placeholder="/blog/default.jpg"
                            className={
                                showLegacyContent ? 'lg:col-span-5' : 'sm:col-span-2 lg:col-span-12'
                            }
                        />

                        {showLegacyContent && (
                            <label
                                htmlFor="blog-content"
                                className="text-sm sm:col-span-2 lg:col-span-7"
                            >
                                <span className="mb-1 block text-muted-foreground">
                                    {l(
                                        'Текст старой версии статьи',
                                        'Legacy article text',
                                        'Raksta iepriekšējās versijas teksts'
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
                                    className="min-h-[90px] w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                    aria-describedby="blog-content-hint"
                                />
                                <span
                                    id="blog-content-hint"
                                    className="mt-1 block text-xs text-muted-foreground"
                                >
                                    {l(
                                        'Сохранено для совместимости со старым форматом. Для нового содержимого используйте блоки ниже.',
                                        'Kept for compatibility with the old format. Use the blocks below for new content.',
                                        'Saglabāts saderībai ar iepriekšējo formātu. Jaunam saturam izmantojiet zemāk esošos blokus.'
                                    )}
                                </span>
                            </label>
                        )}

                        <div className="sm:col-span-2 lg:col-span-12">
                            <BlogContentBlocksEditor
                                blocks={blogForm.contentBlocks}
                                onChange={(contentBlocks) =>
                                    setBlogForm((prev) => ({ ...prev, contentBlocks }))
                                }
                                l={l}
                            />
                        </div>
                    </div>
                </TabsContent>

                <BlogTranslationTabs state={state} />
            </Tabs>

            <div className="grid gap-3 rounded-md border border-border/70 bg-background/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={blogForm.featured}
                            onCheckedChange={(checked) =>
                                setBlogForm((prev) => ({ ...prev, featured: checked === true }))
                            }
                        />
                        {tl(
                            'admin.blog.featuredToggle',
                            'Добавить в избранные статьи',
                            'Add to featured articles',
                            'Pievienot izceltajiem rakstiem'
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
                </div>

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

            <div>
                <h2 className="text-sm font-medium mb-2">
                    {l('Связанные товары', 'Related products', 'Saistītās preces')}
                </h2>
                <p className="text-xs text-muted-foreground mb-2">
                    {l(
                        'Начните вводить название, бренд, ID или SKU и выберите товар из выпадающего списка. Вставлять ID вручную не нужно. Можно добавить несколько товаров.',
                        'Start typing a name, brand, ID, or SKU, then select a product from the dropdown. You do not need to enter IDs manually. You can add multiple products.',
                        'Sāciet ievadīt nosaukumu, zīmolu, ID vai SKU un izvēlieties preci nolaižamajā sarakstā. ID nav jāievada manuāli. Var pievienot vairākas preces.'
                    )}
                </p>
                <BlogRelatedProductsPicker
                    selectedIds={blogForm.relatedProductIds}
                    onChange={(relatedProductIds) =>
                        setBlogForm((prev) => ({ ...prev, relatedProductIds }))
                    }
                    l={l}
                />
            </div>

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={blogSaving}>
                    {blogSaving
                        ? tl('admin.blog.saving', 'Сохранение...', 'Saving...', 'Saglabāšana...')
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
                    <Button type="button" variant="outline" onClick={handleCancelBlogEdit}>
                        {tl(
                            'admin.blog.cancelEdit',
                            'Отменить редактирование',
                            'Cancel editing',
                            'Atcelt rediģēšanu'
                        )}
                    </Button>
                )}
                {blogMessage && <span className="text-sm text-green-700">{blogMessage}</span>}
                {blogError && <span className="text-sm text-red-600">{blogError}</span>}
            </div>
        </form>
    );
}
