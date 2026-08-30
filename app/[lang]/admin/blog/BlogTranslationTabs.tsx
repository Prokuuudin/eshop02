'use client';

import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { useAdminBlogPage } from './useAdminBlogPage';

type State = ReturnType<typeof useAdminBlogPage>;

export default function BlogTranslationTabs({ state }: { state: State }): React.ReactElement {
    const { l, blogForm, setBlogForm } = state;

    return (
        <>
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
        </>
    );
}

