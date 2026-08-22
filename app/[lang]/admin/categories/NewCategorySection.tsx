'use client';

import React from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function AccessibleLabel({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}): React.ReactElement {
    const id = React.useId();
    return (
        <label htmlFor={id} className={className}>
            {React.Children.map(children, (child) =>
                React.isValidElement<{ id?: string }>(child) && child.type === Input
                    ? React.cloneElement(child, { id })
                    : child
            )}
        </label>
    );
}

import type { useAdminCategoriesPage } from './useAdminCategoriesPage';

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>;

export default function NewCategorySection({
    state,
}: {
    state: CategoriesState;
}): React.ReactElement {
    const {
        tl,
        saving,
        newCategory,
        setNewCategory,
        newCategoryPreviewLabel,
        handleCreateCategory,
    } = state;
    return (
        <>
            <details className="group rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3.5 transition-colors hover:bg-emerald-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset dark:hover:bg-emerald-900/30 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                        className="h-5 w-5 shrink-0 text-emerald-700 transition-transform duration-200 group-open:rotate-180 dark:text-emerald-400"
                        aria-hidden="true"
                    />
                    <h2 className="text-lg font-semibold text-foreground">
                        {tl(
                            'admin.categories.createTitle',
                            'Создать новую категорию',
                            'Create new category',
                            'Izveidot jaunu kategoriju'
                        )}
                    </h2>
                </summary>
                <div className="border-t border-emerald-200 p-4 dark:border-emerald-800">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="grid gap-2 md:grid-cols-3">
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">ID (slug)</span>
                                <Input
                                    value={newCategory.id}
                                    placeholder={tl(
                                        'admin.categories.placeholder.id',
                                        'Например: hair-care',
                                        'Example: hair-care',
                                        'Piemers: hair-care'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            id: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs md:col-span-2">
                                <span className="mb-1 block text-muted-foreground">Image</span>
                                <Input
                                    value={newCategory.image}
                                    placeholder={tl(
                                        'admin.categories.placeholder.image',
                                        '/categories/hair-care.jpg',
                                        '/categories/hair-care.jpg',
                                        '/categories/hair-care.jpg'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            image: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">Name RU</span>
                                <Input
                                    value={newCategory.ru}
                                    placeholder={tl(
                                        'admin.categories.placeholder.nameRu',
                                        'Уход за волосами',
                                        'Hair care',
                                        'Matu kopsana'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            ru: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">Name EN</span>
                                <Input
                                    value={newCategory.en}
                                    placeholder={tl(
                                        'admin.categories.placeholder.nameEn',
                                        'Hair care',
                                        'Hair care',
                                        'Hair care'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            en: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">Name LV</span>
                                <Input
                                    value={newCategory.lv}
                                    placeholder={tl(
                                        'admin.categories.placeholder.nameLv',
                                        'Matu kopsana',
                                        'Hair care',
                                        'Matu kopsana'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            lv: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                        </div>

                        <div className="rounded-lg border border-border bg-muted p-2 dark:bg-gray-800/40">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {tl(
                                    'admin.categories.previewCard',
                                    'Превью карточки',
                                    'Card preview',
                                    'Kartites priekskats'
                                )}
                            </p>
                            <div className="overflow-hidden rounded-md border border-border bg-card">
                                <Image
                                    src={newCategory.image.trim() || '/categories/new.jpg'}
                                    alt={newCategoryPreviewLabel}
                                    width={400}
                                    height={144}
                                    unoptimized
                                    className="h-36 w-full object-cover"
                                    loading="lazy"
                                    onError={(event) => {
                                        event.currentTarget.onerror = null;
                                        event.currentTarget.src = '/categories/new.jpg';
                                    }}
                                />
                                <div className="px-3 py-2 text-sm font-medium text-foreground">
                                    {newCategoryPreviewLabel}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 rounded-md border border-dashed border-border p-3">
                        <p className="text-xs font-medium text-foreground">
                            {tl(
                                'admin.categories.firstSubOptional',
                                'Первый подпункт (опционально)',
                                'First subcategory (optional)',
                                'Pirma apakskategorija (neobligata)'
                            )}
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-4">
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">Slug</span>
                                <Input
                                    value={newCategory.firstSubSlug}
                                    placeholder={tl(
                                        'admin.categories.placeholder.firstSubSlug',
                                        'Например: shampoo',
                                        'Example: shampoo',
                                        'Piemers: shampoo'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            firstSubSlug: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">RU</span>
                                <Input
                                    value={newCategory.firstSubRu}
                                    placeholder={tl(
                                        'admin.categories.placeholder.firstSubRu',
                                        'Шампуни',
                                        'Shampoos',
                                        'Sampuni'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            firstSubRu: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">EN</span>
                                <Input
                                    value={newCategory.firstSubEn}
                                    placeholder={tl(
                                        'admin.categories.placeholder.firstSubEn',
                                        'Shampoos',
                                        'Shampoos',
                                        'Shampoos'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            firstSubEn: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                            <AccessibleLabel className="text-xs">
                                <span className="mb-1 block text-muted-foreground">LV</span>
                                <Input
                                    value={newCategory.firstSubLv}
                                    placeholder={tl(
                                        'admin.categories.placeholder.firstSubLv',
                                        'Sampuni',
                                        'Shampoos',
                                        'Sampuni'
                                    )}
                                    onChange={(event) =>
                                        setNewCategory((prev) => ({
                                            ...prev,
                                            firstSubLv: event.target.value,
                                        }))
                                    }
                                />
                            </AccessibleLabel>
                        </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                        <Button onClick={() => void handleCreateCategory()} disabled={saving}>
                            {saving
                                ? tl(
                                      'admin.categories.saving',
                                      'Сохранение...',
                                      'Saving...',
                                      'Saglabasana...'
                                  )
                                : tl(
                                      'admin.categories.createButton',
                                      'Создать категорию',
                                      'Create category',
                                      'Izveidot kategoriju'
                                  )}
                        </Button>
                    </div>
                </div>
            </details>
        </>
    );
}
