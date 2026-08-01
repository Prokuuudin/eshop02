'use client';

import React from 'react';
import AdminGate from '@/components/admin/AdminGate';

import { useAdminCategoriesPage } from './useAdminCategoriesPage';
import CategoriesHeader from './CategoriesHeader';
import CategoriesMessage from './CategoriesMessage';
import CategoriesError from './CategoriesError';
import NewCategorySection from './NewCategorySection';
import ActiveCategoriesSection from './ActiveCategoriesSection';
import DeletedCategoriesSection from './DeletedCategoriesSection';
export default function AdminCategoriesPage(): React.ReactElement {
    const state = useAdminCategoriesPage();
    return (
        <AdminGate>
            <main className="admin-categories-page w-full py-4 space-y-4">
                <CategoriesHeader state={state} />

                <CategoriesMessage state={state} />
                <CategoriesError state={state} />

                <NewCategorySection state={state} />

                <ActiveCategoriesSection state={state} />

                <DeletedCategoriesSection state={state} />
            </main>
        </AdminGate>
    );
}
