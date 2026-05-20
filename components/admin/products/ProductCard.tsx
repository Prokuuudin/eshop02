'use client';

import React, { useState } from 'react';
import type { Product, BadgeType } from '@/data/products';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell } from 'lucide-react';
import { useStockNotifyStore } from '@/lib/stock-notify-store';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
    const { getByProduct, notifyProduct } = useStockNotifyStore();
    const subscribers = getByProduct(product.id);

    const [stock, setStock] = useState(product.stock);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const handleSaveStock = async () => {
        setSaving(true)
        setSaveMsg('')
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, changes: { stock } }),
            })
            if (!res.ok) throw new Error('save failed')

            if (product.stock === 0 && stock > 0 && subscribers.length > 0) {
                notifyProduct(product.id, product.title)
                setSaveMsg(`Сохранено. Уведомлено ${subscribers.length} подписчиков.`)
            } else {
                setSaveMsg('Сохранено.')
            }
        } catch {
            setSaveMsg('Ошибка при сохранении.')
        } finally {
            setSaving(false)
            setTimeout(() => setSaveMsg(''), 3000)
        }
    }

    return (
        <article className="rounded-lg bg-white p-4 dark:bg-gray-900">
            <div className="admin-products__list flex flex-col md:flex-row gap-4">
                <div className="admin-products__item flex-1">
                    <div className="admin-products__item-header flex flex-wrap gap-2 items-center mb-2">
                        <span className="admin-products__item-id text-xs font-semibold text-gray-700 dark:text-gray-200">
                            ID: {product.id}
                        </span>
                        <span className="admin-products__item-title text-xs text-gray-500 dark:text-gray-400">
                            {product.title}
                        </span>
                        {product.badges?.map((badge) => (
                            <Badge key={badge} className="ml-1">
                                {badge}
                            </Badge>
                        ))}
                        {product.stock === 0 && (
                            <Badge variant="destructive" className="ml-1">Нет в наличии</Badge>
                        )}
                    </div>

                    <div className="admin-products__stock flex items-center gap-2 mt-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            Остаток:
                        </label>
                        <Input
                            type="number"
                            min={0}
                            value={stock}
                            onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-24 h-7 text-sm"
                        />
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveStock} disabled={saving}>
                            {saving ? '...' : 'Сохранить'}
                        </Button>
                        {subscribers.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                                <Bell className="w-3 h-3" />
                                {subscribers.length} подписчик{subscribers.length > 1 ? 'а' : ''}
                            </span>
                        )}
                        {saveMsg && (
                            <span className="text-xs text-green-600 dark:text-green-400">{saveMsg}</span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <Button size="sm" onClick={onEdit}>
                        Редактировать
                    </Button>
                    <Button size="sm" variant="destructive" onClick={onDelete}>
                        Удалить
                    </Button>
                </div>
            </div>
        </article>
    );
};

export default ProductCard;
