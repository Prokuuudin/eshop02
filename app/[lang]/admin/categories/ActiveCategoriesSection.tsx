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
            <details className="group rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3.5 transition-colors hover:bg-emerald-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset dark:hover:bg-emerald-900/30 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                        className="h-5 w-5 shrink-0 text-emerald-700 transition-transform duration-200 group-open:rotate-180 dark:text-emerald-400"
                        aria-hidden="true"
                    />
                    <h2 className="text-lg font-semibold text-foreground">
                        {tl(
                            'admin.categories.existingCatalog',
                            'Существующие категории каталога',
                            'Existing catalog categories',
                            'Esošās kataloga kategorijas'
                        )}
                    </h2>
                </summary>
                <div className="space-y-3 border-t border-emerald-200 p-3 dark:border-emerald-800">
                    {loading ? (
                        <div className="rounded-lg bg-background/80 p-4 text-sm text-muted-foreground">
                            {tl(
                                'admin.categories.loading',
                                'Загрузка категорий...',
                                'Loading categories...',
                                'Notiek kategoriju ielāde...'
                            )}
                        </div>
                    ) : (
                        categories.map((category) => (
                            <article
                                key={category.id}
                                className="overflow-hidden rounded-xl bg-rose-50/80 p-3 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50"
                            >
                                <div className="relative lg:pr-[224px]">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div>
                                            <h3 className="text-xl font-extrabold tracking-tight text-foreground">
                                                {category.labels[language] || category.id}
                                            </h3>
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
                                                          'Сохранение...',
                                                          'Saving...',
                                                          'Saglabāšana...'
                                                      )
                                                    : tl(
                                                          'admin.categories.saveButton',
                                                          'Сохранить',
                                                          'Save',
                                                          'Saglabāt'
                                                      )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    handleResetCategoryChanges(category.id)
                                                }
                                                disabled={saving}
                                            >
                                                {tl(
                                                    'admin.categories.resetButton',
                                                    'Сбросить',
                                                    'Reset',
                                                    'Atiestatīt'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() =>
                                                    void handleMoveCategoryToTrash(category.id)
                                                }
                                                disabled={saving}
                                            >
                                                {tl(
                                                    'admin.categories.moveToTrashButton',
                                                    'В корзину',
                                                    'Move to trash',
                                                    'Uz atkritni'
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-2 grid gap-2">
                                        <div className="grid gap-2 md:grid-cols-3">
                                            <AccessibleLabel className="text-xs">
                                                <span className="mb-1 block text-muted-foreground">
                                                    RU
                                                </span>
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
                                                <span className="mb-1 block text-muted-foreground">
                                                    EN
                                                </span>
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
                                                <span className="mb-1 block text-muted-foreground">
                                                    LV
                                                </span>
                                                <Input
                                                    value={category.labels.lv}
                                                    onChange={(event) =>
                                                        updateCategoryLabels(category.id, {
                                                            lv: event.target.value,
                                                        })
                                                    }
                                                />
                                            </AccessibleLabel>
                                            <AccessibleLabel className="text-xs md:col-span-3">
                                                <span className="mb-1 block text-muted-foreground">
                                                    Image
                                                </span>
                                                <Input
                                                    value={category.image}
                                                    onChange={(event) =>
                                                        setCategories((prev) =>
                                                            prev.map((item) =>
                                                                item.id === category.id
                                                                    ? {
                                                                          ...item,
                                                                          image: event.target.value,
                                                                      }
                                                                    : item
                                                            )
                                                        )
                                                    }
                                                />
                                            </AccessibleLabel>
                                        </div>

                                        <div className="flex h-full flex-col overflow-hidden rounded-lg bg-muted dark:bg-gray-800/40 lg:absolute lg:-bottom-3 lg:right-8 lg:top-0 lg:w-[180px]">
                                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-card">
                                                <Image
                                                    src={
                                                        category.image.trim() ||
                                                        '/categories/new.jpg'
                                                    }
                                                    alt={category.labels[language] || category.id}
                                                    width={400}
                                                    height={144}
                                                    unoptimized
                                                    className="min-h-24 w-full flex-1 object-cover"
                                                    loading="lazy"
                                                    onError={(event) => {
                                                        event.currentTarget.onerror = null;
                                                        event.currentTarget.src =
                                                            '/categories/new.jpg';
                                                    }}
                                                />
                                                <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                                                    {category.labels[language] || category.id}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <details className="group/subcategories mt-3 rounded-md bg-muted/40">
                                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                                        <ChevronDown
                                            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/subcategories:rotate-180"
                                            aria-hidden="true"
                                        />
                                        <span className="text-xs font-semibold text-foreground">
                                            {tl(
                                                'admin.categories.subcategories',
                                                'Подпункты',
                                                'Subcategories',
                                                'Apakškategorijas'
                                            )}{' '}
                                            ({category.subcategories.length})
                                        </span>
                                    </summary>
                                    <div className="px-2 pb-2">
                                        <div className="mt-2">
                                            {category.subcategories.map((subcategory) => (
                                                <div
                                                    key={`${category.id}-${subcategory.slug}`}
                                                    className="border-b border-border/60 py-2 first:pt-0 last:border-b-0 last:pb-0"
                                                >
                                                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-xs font-medium text-foreground">
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
                                                                'Удалить',
                                                                'Delete',
                                                                'Dzēst'
                                                            )}
                                                        </Button>
                                                    </div>
                                                    <div className="grid gap-2 md:grid-cols-3">
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
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-2 grid gap-2 md:grid-cols-4">
                                            <AccessibleLabel className="text-xs">
                                                <span className="mb-1 block text-muted-foreground">
                                                    New slug
                                                </span>
                                                <Input
                                                    value={
                                                        newSubByCategory[category.id]?.slug ?? ''
                                                    }
                                                    onChange={(event) =>
                                                        setNewSubByCategory((prev) => ({
                                                            ...prev,
                                                            [category.id]: {
                                                                slug: event.target.value,
                                                                search:
                                                                    prev[category.id]?.search ?? '',
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
                                                    RU
                                                </span>
                                                <Input
                                                    value={newSubByCategory[category.id]?.ru ?? ''}
                                                    onChange={(event) =>
                                                        setNewSubByCategory((prev) => ({
                                                            ...prev,
                                                            [category.id]: {
                                                                slug: prev[category.id]?.slug ?? '',
                                                                search:
                                                                    prev[category.id]?.search ?? '',
                                                                ru: event.target.value,
                                                                en: prev[category.id]?.en ?? '',
                                                                lv: prev[category.id]?.lv ?? '',
                                                            },
                                                        }))
                                                    }
                                                />
                                            </AccessibleLabel>
                                            <AccessibleLabel className="text-xs">
                                                <span className="mb-1 block text-muted-foreground">
                                                    EN
                                                </span>
                                                <Input
                                                    value={newSubByCategory[category.id]?.en ?? ''}
                                                    onChange={(event) =>
                                                        setNewSubByCategory((prev) => ({
                                                            ...prev,
                                                            [category.id]: {
                                                                slug: prev[category.id]?.slug ?? '',
                                                                search:
                                                                    prev[category.id]?.search ?? '',
                                                                ru: prev[category.id]?.ru ?? '',
                                                                en: event.target.value,
                                                                lv: prev[category.id]?.lv ?? '',
                                                            },
                                                        }))
                                                    }
                                                />
                                            </AccessibleLabel>
                                            <AccessibleLabel className="text-xs">
                                                <span className="mb-1 block text-muted-foreground">
                                                    LV
                                                </span>
                                                <Input
                                                    value={newSubByCategory[category.id]?.lv ?? ''}
                                                    onChange={(event) =>
                                                        setNewSubByCategory((prev) => ({
                                                            ...prev,
                                                            [category.id]: {
                                                                slug: prev[category.id]?.slug ?? '',
                                                                search:
                                                                    prev[category.id]?.search ?? '',
                                                                ru: prev[category.id]?.ru ?? '',
                                                                en: prev[category.id]?.en ?? '',
                                                                lv: event.target.value,
                                                            },
                                                        }))
                                                    }
                                                />
                                            </AccessibleLabel>
                                        </div>

                                        <div className="mt-2 flex justify-end">
                                            <Button
                                                size="sm"
                                                onClick={() =>
                                                    void handleAddSubcategory(category.id)
                                                }
                                                disabled={saving}
                                            >
                                                {saving
                                                    ? tl(
                                                          'admin.categories.saving',
                                                          'Сохранение...',
                                                          'Saving...',
                                                          'Saglabāšana...'
                                                      )
                                                    : tl(
                                                          'admin.categories.addSubButton',
                                                          'Добавить подпункт',
                                                          'Add subcategory',
                                                          'Pievienot apakškategoriju'
                                                      )}
                                            </Button>
                                        </div>
                                    </div>
                                </details>
                            </article>
                        ))
                    )}
                </div>
            </details>
        </>
    );
}
