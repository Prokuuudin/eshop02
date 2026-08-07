'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

import type { useAdminCategoriesPage } from './useAdminCategoriesPage';

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>;

export default function CategoriesHeader({
    state,
}: {
    state: CategoriesState;
}): React.ReactElement {
    const { tl } = state;
    return (
        <>
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tl(
                                'admin.categories.title',
                                'Категории: управление структурой',
                                'Categories: structure management',
                                'Kategorijas: strukturas parvaldiba'
                            )}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {tl(
                                'admin.categories.subtitle',
                                'Создавайте новые категории, добавляйте и удаляйте подпункты, редактируйте названия на RU/EN/LV.',
                                'Create categories, add/remove subcategories, edit labels in RU/EN/LV.',
                                'Izveidojiet kategorijas, pievienojiet/dzesiet apakskategorijas, redigejiet nosaukumus RU/EN/LV.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {tl(
                                'admin.categories.backToAdmin',
                                'Назад в админку',
                                'Back to admin',
                                'Atpakal uz admin'
                            )}
                        </Button>
                    </Link>
                </div>
            </div>
        </>
    );
}
