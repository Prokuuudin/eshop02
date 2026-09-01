'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import AddProductForm from '@/components/admin/products/AddProductForm';
import type { AddProductFormValues } from '@/components/admin/products/productFormSchema';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductEditPageContentProps {
    productId: string;
    productTitle: string;
    initialValues: AddProductFormValues;
    revision: number;
    seoContext?: {
        returnTo: string;
        duplicateMetaTitle: boolean;
        duplicateMetaDescription: boolean;
        initialMetaTitle: string;
        initialMetaDescription: string;
    };
}

export default function ProductEditPageContent({
    productId,
    productTitle,
    initialValues,
    revision,
    seoContext,
}: ProductEditPageContentProps): React.ReactElement {
    const { l } = useAdminLocale();
    return (
        <AdminGate>
            <main className="admin-products w-full space-y-4 text-foreground">
                <div className="rounded-xl bg-rose-50/80 p-4 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50">
                    <div className="flex items-center gap-3 mb-4">
                        <Link
                            href={seoContext?.returnTo ?? '/admin/products'}
                            className="text-sm text-primary hover:underline"
                        >
                            ← {seoContext ? l('Вернуться в SEO-отчёт', 'Back to SEO report', 'Atpakaļ uz SEO pārskatu') : l('Все товары', 'All products', 'Visi produkti')}
                        </Link>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-sm text-muted-foreground truncate">{productTitle}</span>
                    </div>
                    <h1 className="text-2xl font-bold mb-6">
                        {l('Редактирование:', 'Editing:', 'Rediģēšana:')} {productTitle}
                    </h1>
                    <AddProductForm
                        mode="edit"
                        productId={productId}
                        initialValues={initialValues}
                        revision={revision}
                        seoContext={seoContext}
                    />
                </div>
            </main>
        </AdminGate>
    );
}
