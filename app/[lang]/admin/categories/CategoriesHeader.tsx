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
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tl(
                                'admin.categories.title',
                                'ÐšÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸: ÑƒÐ¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ ÑÑ‚Ñ€ÑƒÐºÑ‚ÑƒÑ€Ð¾Ð¹',
                                'Categories: structure management',
                                'Kategorijas: strukturas parvaldiba'
                            )}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {tl(
                                'admin.categories.subtitle',
                                'Ð¡Ð¾Ð·Ð´Ð°Ð²Ð°Ð¹Ñ‚Ðµ Ð½Ð¾Ð²Ñ‹Ðµ ÐºÐ°Ñ‚ÐµÐ³Ð¾Ñ€Ð¸Ð¸, Ð´Ð¾Ð±Ð°Ð²Ð»ÑÐ¹Ñ‚Ðµ Ð¸ ÑƒÐ´Ð°Ð»ÑÐ¹Ñ‚Ðµ Ð¿Ð¾Ð´Ð¿ÑƒÐ½ÐºÑ‚Ñ‹, Ñ€ÐµÐ´Ð°ÐºÑ‚Ð¸Ñ€ÑƒÐ¹Ñ‚Ðµ Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ñ Ð½Ð° RU/EN/LV.',
                                'Create categories, add/remove subcategories, edit labels in RU/EN/LV.',
                                'Izveidojiet kategorijas, pievienojiet/dzesiet apakskategorijas, redigejiet nosaukumus RU/EN/LV.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {tl(
                                'admin.categories.backToAdmin',
                                'ÐÐ°Ð·Ð°Ð´ Ð² Ð°Ð´Ð¼Ð¸Ð½ÐºÑƒ',
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
