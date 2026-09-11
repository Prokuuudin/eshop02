'use client';

import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import BlogContentBlocksEditor from '@/components/admin/blog/BlogContentBlocksEditor';
import type { useAdminBlogPage } from './useAdminBlogPage';

type State = ReturnType<typeof useAdminBlogPage>;

export default function BlogTranslationTabs({ state }: { state: State }): React.ReactElement {
    const { l, blogForm, setBlogForm, editingBlogId } = state;

    return (
        <>
            {(['en', 'lv'] as const).map((lang) => (
                <TabsContent key={lang} value={lang}>
                    <p className="mb-3 text-xs text-muted-foreground">
                        {l(
                            'Пустые поля наследуют значение из основной (RU) вкладки. Заполните только те поля, которые отличаются.',
                            'Empty fields inherit the value from the primary (RU) tab. Fill in only the fields that differ.',
                            'Tukšie lauki pārmanto vērtību no pamata (RU) cilnes. Aizpildiet tikai atšķirīgos laukus.'
                        )}
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
                        <label className="text-sm md:col-span-2 lg:col-span-12">
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

                        <label className="text-sm md:col-span-2 lg:col-span-12">
                            <span className="block text-muted-foreground mb-1">
                                {l('Краткое описание', 'Short description', 'Īss apraksts')} ({lang}
                                )
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
                                className="min-h-[64px] w-full rounded border border-border bg-card px-3 py-2 text-foreground"
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

                        <label className="text-sm lg:col-span-6">
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

                        <label className="text-sm lg:col-span-6">
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
                                placeholder={blogForm.category || `Category (${lang})`}
                            />
                        </label>

                        {editingBlogId && blogForm.translations[lang].content.trim() && (
                            <label className="text-sm md:col-span-2 lg:col-span-12">
                                <span className="block text-muted-foreground mb-1">
                                    {l(
                                        `Текст старой версии статьи (${lang})`,
                                        `Legacy article text (${lang})`,
                                        `Raksta iepriekšējās versijas teksts (${lang})`
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
                                    className="min-h-[90px] w-full rounded border border-border bg-card px-3 py-2 text-foreground"
                                />
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    {l(
                                        'Сохранено для совместимости. Для нового содержимого используйте блоки ниже.',
                                        'Kept for compatibility. Use the blocks below for new content.',
                                        'Saglabāts saderībai. Jaunam saturam izmantojiet zemāk esošos blokus.'
                                    )}
                                </span>
                            </label>
                        )}

                        <div className="md:col-span-2 lg:col-span-12">
                            <BlogContentBlocksEditor
                                blocks={blogForm.translations[lang].contentBlocks}
                                onChange={(contentBlocks) =>
                                    setBlogForm((prev) => ({
                                        ...prev,
                                        translations: {
                                            ...prev.translations,
                                            [lang]: {
                                                ...prev.translations[lang],
                                                contentBlocks,
                                            },
                                        },
                                    }))
                                }
                                l={l}
                            />
                        </div>
                    </div>
                </TabsContent>
            ))}
        </>
    );
}
