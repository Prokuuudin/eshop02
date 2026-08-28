'use client';

import React from 'react';
import Image from 'next/image';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import { Button } from '@/components/ui/button';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ArchivePanelProps {
    archiveItems: ArchivedProductRecord[];
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
}

const ArchivePanel: React.FC<ArchivePanelProps> = ({ archiveItems, onRestore, onDelete }) => {
    const { locale, l } = useAdminLocale();
    const formatDeletedAt = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    };
    const formatPrice = (price: number) => new Intl.NumberFormat(locale, {
        style: 'currency', currency: 'EUR',
    }).format(price);

    return (
        <div className="admin-products__archive-panel">
            <p className="mb-3 text-xs text-muted-foreground">
                {l(
                    'Здесь хранятся товары, удалённые из каталога. Вы можете восстановить их или удалить навсегда.',
                    'Products removed from the catalog are stored here. You can restore or permanently delete them.',
                    'Šeit glabājas no kataloga izņemtās preces. Tās var atjaunot vai neatgriezeniski dzēst.',
                )}
            </p>
            {archiveItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">{l('Корзина пуста', 'Trash is empty', 'Atkritne ir tukša')}</p>
            ) : (
                <div className="space-y-3">
                    {archiveItems.map((item) => {
                        const product = item.product;
                        const imageUrl = product.image || product.images?.[0];
                        const deletedAt = formatDeletedAt(item.deletedAt);
                        return (
                            <article key={item.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <div className="product-image-surface flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border">
                                        {imageUrl ? (
                                            <Image unoptimized src={imageUrl} alt={product.title} width={80} height={80} className="h-full w-full object-contain p-1" />
                                        ) : (
                                            <span className="px-1 text-center text-[10px] text-muted-foreground">
                                                {l('Нет фото', 'No image', 'Nav attēla')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                                            {product.title || l('Без названия', 'Untitled product', 'Prece bez nosaukuma')}
                                        </h3>
                                        {product.brand && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{product.brand}</p>}
                                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                                            {product.sku && <div><dt className="inline text-muted-foreground">{l('Артикул', 'SKU', 'Artikuls')}: </dt><dd className="inline font-medium">{product.sku}</dd></div>}
                                            {product.barcode && <div><dt className="inline text-muted-foreground">{l('Штрихкод', 'Barcode', 'Svītrkods')}: </dt><dd className="inline font-mono">{product.barcode}</dd></div>}
                                            <div><dt className="inline text-muted-foreground">ID: </dt><dd className="inline break-all font-mono">{item.id}</dd></div>
                                            <div><dt className="inline text-muted-foreground">{l('Цена', 'Price', 'Cena')}: </dt><dd className="inline font-semibold">{formatPrice(product.price)}</dd></div>
                                            <div><dt className="inline text-muted-foreground">{l('Остаток', 'Stock', 'Atlikums')}: </dt><dd className="inline font-medium">{product.stock}</dd></div>
                                            {deletedAt && <div><dt className="inline text-muted-foreground">{l('Удалён', 'Deleted', 'Dzēsts')}: </dt><dd className="inline">{deletedAt}</dd></div>}
                                        </dl>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
                                    <Button size="sm" variant="outline" onClick={() => onRestore(item.id)}>
                                        {l('Восстановить', 'Restore', 'Atjaunot')}
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => onDelete(item.id)}>
                                        {l('Удалить навсегда', 'Delete permanently', 'Dzēst neatgriezeniski')}
                                    </Button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ArchivePanel;
