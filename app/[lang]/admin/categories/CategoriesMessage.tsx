'use client';

import React from 'react';

import type { useAdminCategoriesPage } from './useAdminCategoriesPage';

type CategoriesState = ReturnType<typeof useAdminCategoriesPage>;

export default function CategoriesMessage({
    state,
}: {
    state: CategoriesState;
}): React.ReactElement {
    const { message } = state;
    return (
        <>
            {message && (
                <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
                    {message}
                </p>
            )}
        </>
    );
}
