'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import AddProductForm from '@/components/admin/products/AddProductForm';
import type { AddProductFormValues } from '@/components/admin/products/productFormSchema';

interface ProductEditPageContentProps {
    productId: string;
    productTitle: string;
    initialValues: AddProductFormValues;
    revision: number;
}

export default function ProductEditPageContent({
    productId,
    productTitle,
    initialValues,
    revision,
}: ProductEditPageContentProps): React.ReactElement {
    return (
        <AdminGate>
            <main className="admin-products w-full space-y-4 text-foreground">
                <div className="rounded-lg bg-card p-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Link
                            href="/admin/products"
                            className="text-sm text-primary hover:underline"
                        >
                            ← Все товары
                        </Link>
                        <span className="text-gray-400">/</span>
                        <span className="text-sm text-gray-500 truncate">{productTitle}</span>
                    </div>
                    <h1 className="text-2xl font-bold mb-6">
                        Редактирование: {productTitle}
                    </h1>
                    <AddProductForm
                        mode="edit"
                        productId={productId}
                        initialValues={initialValues}
                        revision={revision}
                    />
                </div>
            </main>
        </AdminGate>
    );
}
