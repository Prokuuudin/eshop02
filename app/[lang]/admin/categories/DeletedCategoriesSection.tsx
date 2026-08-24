'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

import type { useAdminCategoriesPage } from './useAdminCategoriesPage';

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>;

export default function DeletedCategoriesSection({
    state,
}: {
    state: CategoriesState;
}): React.ReactElement {
    const {
        language,
        tl,
        deletedCategories,
        saving,
        handleRestoreCategory,
        handleDeleteCategoryForever,
    } = state;
    return (
        <>
            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-lg font-semibold text-foreground">
                    {tl(
                        'admin.categories.trashTitle',
                        'Корзина категорий',
                        'Categories trash',
                        'Kategoriju atkritne'
                    )}{' '}
                    ({deletedCategories.length})
                </h2>

                {deletedCategories.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                        {tl(
                            'admin.categories.trashEmpty',
                            'Корзина пуста',
                            'Trash is empty',
                            'Grozs ir tukss'
                        )}
                    </p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {deletedCategories.map((category) => (
                            <div
                                key={`trash-${category.id}`}
                                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                            >
                                <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                    {category.id}
                                </span>
                                <span className="text-sm text-foreground">
                                    {category.labels[language] || category.id}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {tl(
                                        'admin.categories.subcategoriesCount',
                                        'Подпунктов',
                                        'Subcategories',
                                        'Apakškategorijas'
                                    )}
                                    : {category.subcategories.length}
                                </span>
                                <div className="ml-auto flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void handleRestoreCategory(category.id)}
                                        disabled={saving}
                                    >
                                        {tl(
                                            'admin.categories.restoreButton',
                                            'Восстановить',
                                            'Restore',
                                            'Atjaunot'
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() =>
                                            void handleDeleteCategoryForever(category.id)
                                        }
                                        disabled={saving}
                                    >
                                        {tl(
                                            'admin.categories.deleteForeverButton',
                                            'Удалить навсегда',
                                            'Delete forever',
                                            'Dzēst neatgriezeniski'
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
