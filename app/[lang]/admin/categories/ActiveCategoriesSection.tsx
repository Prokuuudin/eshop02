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

export default function ActiveCategoriesSection({
    state,
}: {
    state: CategoriesState;
}): React.ReactElement {
    const {
            language,
            tl,
            categories,
            setCategories,
            loading,
            saving,
            newSubByCategory,
            setNewSubByCategory,
            updateCategoryLabels,
            updateSubcategoryLabels,
            handleAddSubcategory,
            handleRemoveSubcategory,
            handleSaveCategory,
            handleResetCategoryChanges,
            handleMoveCategoryToTrash,
          } = state;
    return (
        <>
            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">
                    {tl(
                        'admin.categories.existingCatalog',
                        'Ð¡ÑƒÑ‰ÐµÑÑ‚Ð²ÑƒÑŽÑ‰Ð¸Ðµ ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸ ÐºÐ°Ñ‚Ð°Ð»Ð¾Ð³Ð°',
                        'Existing catalog categories',
                        'EsoÅ¡Äs kataloga kategorijas'
                    )}
                </h2>
                {loading ? (
                    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {tl(
                            'admin.categories.loading',
                            'Ð—Ð°Ð³Ñ€ÑƒÐ·ÐºÐ° ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¹...',
                            'Loading categories...',
                            'Ieladejam kategorijas...'
                        )}
                    </div>
                ) : (
                    categories.map((category) => (
                        <article
                            key={category.id}
                            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-semibold text-foreground">
                                        {category.labels[language] || category.id}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">{category.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => void handleSaveCategory()}
                                        disabled={saving}
                                    >
                                        {saving
                                            ? tl(
                                                  'admin.categories.saving',
                                                  'Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ðµ...',
                                                  'Saving...',
                                                  'Saglabasana...'
                                              )
                                            : tl(
                                                  'admin.categories.saveButton',
                                                  'Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ',
                                                  'Save',
                                                  'Saglabat'
                                              )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleResetCategoryChanges(category.id)}
                                        disabled={saving}
                                    >
                                        {tl(
                                            'admin.categories.resetButton',
                                            'Ð¡Ð±Ñ€Ð¾ÑÐ¸Ñ‚ÑŒ',
                                            'Reset',
                                            'Atiestatit'
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => void handleMoveCategoryToTrash(category.id)}
                                        disabled={saving}
                                    >
                                        {tl(
                                            'admin.categories.moveToTrashButton',
                                            'Ð’ ÐºÐ¾Ñ€Ð·Ð¸Ð½Ñƒ',
                                            'Move to trash',
                                            'Uz grozu'
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <div className="grid gap-2 md:grid-cols-4">
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">RU</span>
                                        <Input
                                            value={category.labels.ru}
                                            onChange={(event) =>
                                                updateCategoryLabels(category.id, {
                                                    ru: event.target.value,
                                                })
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">EN</span>
                                        <Input
                                            value={category.labels.en}
                                            onChange={(event) =>
                                                updateCategoryLabels(category.id, {
                                                    en: event.target.value,
                                                })
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">LV</span>
                                        <Input
                                            value={category.labels.lv}
                                            onChange={(event) =>
                                                updateCategoryLabels(category.id, {
                                                    lv: event.target.value,
                                                })
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs md:col-span-4">
                                        <span className="mb-1 block text-muted-foreground">
                                            Image
                                        </span>
                                        <Input
                                            value={category.image}
                                            onChange={(event) =>
                                                setCategories((prev) =>
                                                    prev.map((item) =>
                                                        item.id === category.id
                                                            ? { ...item, image: event.target.value }
                                                            : item
                                                    )
                                                )
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
                                            src={category.image.trim() || '/categories/new.jpg'}
                                            alt={category.labels[language] || category.id}
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
                                            {category.labels[language] || category.id}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-700">
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                    {tl(
                                        'admin.categories.subcategories',
                                        'ÐŸÐ¾Ð´Ð¿ÑƒÐ½ÐºÑ‚Ñ‹',
                                        'Subcategories',
                                        'Apakskategorijas'
                                    )}{' '}
                                    ({category.subcategories.length})
                                </p>

                                <div className="mt-2 space-y-2">
                                    {category.subcategories.map((subcategory) => (
                                        <div
                                            key={`${category.id}-${subcategory.slug}`}
                                            className="rounded border border-gray-200 p-2 dark:border-gray-700"
                                        >
                                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                                    {subcategory.slug}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() =>
                                                        void handleRemoveSubcategory(
                                                            category.id,
                                                            subcategory.slug
                                                        )
                                                    }
                                                    disabled={saving}
                                                >
                                                    {tl(
                                                        'admin.categories.deleteButton',
                                                        'Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ',
                                                        'Delete',
                                                        'Dzest'
                                                    )}
                                                </Button>
                                            </div>
                                            <div className="grid gap-2 md:grid-cols-4">
                                                <AccessibleLabel className="text-xs">
                                                    <span className="mb-1 block text-muted-foreground">
                                                        RU
                                                    </span>
                                                    <Input
                                                        value={subcategory.labels.ru}
                                                        onChange={(event) =>
                                                            updateSubcategoryLabels(
                                                                category.id,
                                                                subcategory.slug,
                                                                { ru: event.target.value }
                                                            )
                                                        }
                                                    />
                                                </AccessibleLabel>
                                                <AccessibleLabel className="text-xs">
                                                    <span className="mb-1 block text-muted-foreground">
                                                        EN
                                                    </span>
                                                    <Input
                                                        value={subcategory.labels.en}
                                                        onChange={(event) =>
                                                            updateSubcategoryLabels(
                                                                category.id,
                                                                subcategory.slug,
                                                                { en: event.target.value }
                                                            )
                                                        }
                                                    />
                                                </AccessibleLabel>
                                                <AccessibleLabel className="text-xs">
                                                    <span className="mb-1 block text-muted-foreground">
                                                        LV
                                                    </span>
                                                    <Input
                                                        value={subcategory.labels.lv}
                                                        onChange={(event) =>
                                                            updateSubcategoryLabels(
                                                                category.id,
                                                                subcategory.slug,
                                                                { lv: event.target.value }
                                                            )
                                                        }
                                                    />
                                                </AccessibleLabel>
                                                <AccessibleLabel className="text-xs">
                                                    <span className="mb-1 block text-muted-foreground">
                                                        Search token
                                                    </span>
                                                    <Input
                                                        value={subcategory.search}
                                                        onChange={(event) =>
                                                            setCategories((prev) =>
                                                                prev.map((item) => {
                                                                    if (item.id !== category.id)
                                                                        return item;
                                                                    return {
                                                                        ...item,
                                                                        subcategories:
                                                                            item.subcategories.map(
                                                                                (sub) =>
                                                                                    sub.slug ===
                                                                                    subcategory.slug
                                                                                        ? {
                                                                                              ...sub,
                                                                                              search: event
                                                                                                  .target
                                                                                                  .value,
                                                                                          }
                                                                                        : sub
                                                                            ),
                                                                    };
                                                                })
                                                            )
                                                        }
                                                    />
                                                </AccessibleLabel>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 grid gap-2 md:grid-cols-5">
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">
                                            New slug
                                        </span>
                                        <Input
                                            value={newSubByCategory[category.id]?.slug ?? ''}
                                            onChange={(event) =>
                                                setNewSubByCategory((prev) => ({
                                                    ...prev,
                                                    [category.id]: {
                                                        slug: event.target.value,
                                                        search: prev[category.id]?.search ?? '',
                                                        ru: prev[category.id]?.ru ?? '',
                                                        en: prev[category.id]?.en ?? '',
                                                        lv: prev[category.id]?.lv ?? '',
                                                    },
                                                }))
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">
                                            Search token
                                        </span>
                                        <Input
                                            value={newSubByCategory[category.id]?.search ?? ''}
                                            onChange={(event) =>
                                                setNewSubByCategory((prev) => ({
                                                    ...prev,
                                                    [category.id]: {
                                                        slug: prev[category.id]?.slug ?? '',
                                                        search: event.target.value,
                                                        ru: prev[category.id]?.ru ?? '',
                                                        en: prev[category.id]?.en ?? '',
                                                        lv: prev[category.id]?.lv ?? '',
                                                    },
                                                }))
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">RU</span>
                                        <Input
                                            value={newSubByCategory[category.id]?.ru ?? ''}
                                            onChange={(event) =>
                                                setNewSubByCategory((prev) => ({
                                                    ...prev,
                                                    [category.id]: {
                                                        slug: prev[category.id]?.slug ?? '',
                                                        search: prev[category.id]?.search ?? '',
                                                        ru: event.target.value,
                                                        en: prev[category.id]?.en ?? '',
                                                        lv: prev[category.id]?.lv ?? '',
                                                    },
                                                }))
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">EN</span>
                                        <Input
                                            value={newSubByCategory[category.id]?.en ?? ''}
                                            onChange={(event) =>
                                                setNewSubByCategory((prev) => ({
                                                    ...prev,
                                                    [category.id]: {
                                                        slug: prev[category.id]?.slug ?? '',
                                                        search: prev[category.id]?.search ?? '',
                                                        ru: prev[category.id]?.ru ?? '',
                                                        en: event.target.value,
                                                        lv: prev[category.id]?.lv ?? '',
                                                    },
                                                }))
                                            }
                                        />
                                    </AccessibleLabel>
                                    <AccessibleLabel className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">LV</span>
                                        <Input
                                            value={newSubByCategory[category.id]?.lv ?? ''}
                                            onChange={(event) =>
                                                setNewSubByCategory((prev) => ({
                                                    ...prev,
                                                    [category.id]: {
                                                        slug: prev[category.id]?.slug ?? '',
                                                        search: prev[category.id]?.search ?? '',
                                                        ru: prev[category.id]?.ru ?? '',
                                                        en: prev[category.id]?.en ?? '',
                                                        lv: event.target.value,
                                                    },
                                                }))
                                            }
                                        />
                                    </AccessibleLabel>
                                </div>

                                <div className="mt-3 flex justify-end">
                                    <Button
                                        size="sm"
                                        onClick={() => void handleAddSubcategory(category.id)}
                                        disabled={saving}
                                    >
                                        {saving
                                            ? tl(
                                                  'admin.categories.saving',
                                                  'Ð¡Ð¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ðµ...',
                                                  'Saving...',
                                                  'Saglabasana...'
                                              )
                                            : tl(
                                                  'admin.categories.addSubButton',
                                                  'Ð”Ð¾Ð±Ð°Ð²Ð¸Ñ‚ÑŒ Ð¿Ð¾Ð´Ð¿ÑƒÐ½ÐºÑ‚',
                                                  'Add subcategory',
                                                  'Pievienot apakskategoriju'
                                              )}
                                    </Button>
                                </div>
                            </div>
                        </article>
                    ))
                )}
            </section>
        </>
    );
}
