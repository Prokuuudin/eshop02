'use client';

import React from 'react';
import Image from 'next/image';
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
    const { tl, saving, newCategory, setNewCategory, newCategoryPreviewLabel, handleCreateCategory } = state;
    return (
        <>
            <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                <h2 className="text-lg font-semibold text-foreground">
                    {tl(
                        'admin.categories.createTitle',
                        'Ð¡Ð¾Ð·Ð´Ð°Ñ‚ÑŒ Ð½Ð¾Ð²ÑƒÑŽ ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸ÑŽ',
                        'Create new category',
                        'Izveidot jaunu kategoriju'
                    )}
                </h2>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="grid gap-2 md:grid-cols-3">
                        <AccessibleLabel className="text-xs">
                            <span className="mb-1 block text-muted-foreground">ID (slug)</span>
                            <Input
                                value={newCategory.id}
                                placeholder={tl(
                                    'admin.categories.placeholder.id',
                                    'ÐÐ°Ð¿Ñ€Ð¸Ð¼ÐµÑ€: hair-care',
                                    'Example: hair-care',
                                    'Piemers: hair-care'
                                )}
                                onChange={(event) =>
                                    setNewCategory((prev) => ({ ...prev, id: event.target.value }))
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
                                    'Ð£Ñ…Ð¾Ð´ Ð·Ð° Ð²Ð¾Ð»Ð¾ÑÐ°Ð¼Ð¸',
                                    'Hair care',
                                    'Matu kopsana'
                                )}
                                onChange={(event) =>
                                    setNewCategory((prev) => ({ ...prev, ru: event.target.value }))
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
                                    setNewCategory((prev) => ({ ...prev, en: event.target.value }))
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
                                    setNewCategory((prev) => ({ ...prev, lv: event.target.value }))
                                }
                            />
                        </AccessibleLabel>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/40">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {tl(
                                'admin.categories.previewCard',
                                'ÐŸÑ€ÐµÐ²ÑŒÑŽ ÐºÐ°Ñ€Ñ‚Ð¾Ñ‡ÐºÐ¸',
                                'Card preview',
                                'Kartites priekskats'
                            )}
                        </p>
                        <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
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

                <div className="mt-3 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        {tl(
                            'admin.categories.firstSubOptional',
                            'ÐŸÐµÑ€Ð²Ñ‹Ð¹ Ð¿Ð¾Ð´Ð¿ÑƒÐ½ÐºÑ‚ (Ð¾Ð¿Ñ†Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð¾)',
                            'First subcategory (optional)',
                            'Pirma apakskategorija (neobligata)'
                        )}
                    </p>
                    <div className="mt-2 grid gap-2 md:grid-cols-5">
                        <AccessibleLabel className="text-xs">
                            <span className="mb-1 block text-muted-foreground">Slug</span>
                            <Input
                                value={newCategory.firstSubSlug}
                                placeholder={tl(
                                    'admin.categories.placeholder.firstSubSlug',
                                    'ÐÐ°Ð¿Ñ€Ð¸Ð¼ÐµÑ€: shampoo',
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
                            <span className="mb-1 block text-muted-foreground">Search token</span>
                            <Input
                                value={newCategory.firstSubSearch}
                                placeholder={tl(
                                    'admin.categories.placeholder.firstSubSearch',
                                    'ÐÐ°Ð¿Ñ€Ð¸Ð¼ÐµÑ€: ÑˆÐ°Ð¼Ð¿ÑƒÐ½ÑŒ',
                                    'Example: shampoo',
                                    'Piemers: sampuns'
                                )}
                                onChange={(event) =>
                                    setNewCategory((prev) => ({
                                        ...prev,
                                        firstSubSearch: event.target.value,
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
                                    'Ð¨Ð°Ð¼Ð¿ÑƒÐ½Ð¸',
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
                                  'Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ðµ...',
                                  'Saving...',
                                  'Saglabasana...'
                              )
                            : tl(
                                  'admin.categories.createButton',
                                  'Ð¡Ð¾Ð·Ð´Ð°Ñ‚ÑŒ ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸ÑŽ',
                                  'Create category',
                                  'Izveidot kategoriju'
                              )}
                    </Button>
                </div>
            </section>
        </>
    );
}
