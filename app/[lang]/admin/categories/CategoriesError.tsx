'use client';

import React from 'react';

import type { useAdminCategoriesPage } from './useAdminCategoriesPage';

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>;

export default function CategoriesError({ state }: { state: CategoriesState }): React.ReactElement {
    const { error } = state;
    return (
        <>
            {error && (
                <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                    {error}
                </p>
            )}
        </>
    );
}
