'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/data/products';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2 } from 'lucide-react';

interface ProductCardProps {
    product: Product;
    onEdit?: () => void;
    onDelete?: () => void;
}

const BADGE_LABELS: Record<string, string> = {
    new: 'Новинка',
    sale: 'Скидка',
    bestseller: 'Хит',
};

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
    const [stock, setStock] = useState(product.stock);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const handleSaveStock = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: product.id, changes: { stock } }),
            });
            if (!res.ok) throw new Error('save failed');
            setSaveMsg('Сохранено');
        } catch {
            setSaveMsg('Ошибка');
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(''), 2500);
        }
    };

    const imageUrl = product.image || product.images?.[0];

    return (
        <article className="admin-product-card flex flex-col rounded-lg border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            {/* Packshot целиком на белой подложке, как в витринной карточке:
                исходники — фото на белом фоне разных пропорций, cover их обрезал/увеличивал. */}
            <div className="admin-product-card__image relative h-40 bg-white flex items-center justify-center overflow-hidden">
                {imageUrl ? (
                    <Image
                        unoptimized
                        src={imageUrl}
                        alt={product.title}
                        width={320}
                        height={160}
                        className="object-contain w-full h-full p-2"
                    />
                ) : (
                    <span className="text-xs text-muted-foreground">Нет фото</span>
                )}
                {/* Бейджи поверх изображения */}
                {product.badges && product.badges.length > 0 && (
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        {product.badges.map((badge) => (
                            <Badge key={badge} className="text-[10px] px-1.5 py-0.5 leading-none">
                                {BADGE_LABELS[badge] ?? badge}
                            </Badge>
                        ))}
                    </div>
                )}
                {product.stock === 0 && (
                    <div className="absolute top-2 right-2">
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 leading-none">
                            Нет в наличии
                        </Badge>
                    </div>
                )}
            </div>

            {/* Информация */}
            <div className="admin-product-card__body flex flex-col flex-1 p-3 gap-1">
                <p className="text-[11px] text-muted-foreground font-mono leading-none">
                    {product.id}
                    {product.sku && <span className="ml-1 text-muted-foreground">· {product.sku}</span>}
                </p>
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 mt-0.5">
                    {product.title}
                </p>
                {product.brand && (
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                )}

                <div className="admin-product-card__price flex items-baseline gap-2 mt-1">
                    <span className="text-base font-bold text-foreground">
                        {product.price.toFixed(2)} €
                    </span>
                    {product.oldPrice && product.oldPrice > product.price && (
                        <span className="text-xs line-through text-muted-foreground">
                            {product.oldPrice.toFixed(2)} €
                        </span>
                    )}
                </div>
            </div>

            {/* Управление остатком */}
            <div className="admin-product-card__stock flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/50">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Остаток:</span>
                <Input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 h-6 px-1 text-xs text-center"
                />
                <button
                    type="button"
                    onClick={handleSaveStock}
                    disabled={saving}
                    className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                    {saving ? '...' : 'Сохр.'}
                </button>
                {saveMsg && (
                    <span className="text-[11px] text-green-600 dark:text-green-400 ml-auto">{saveMsg}</span>
                )}
            </div>

            {/* Кнопки действий */}
            <div className="admin-product-card__actions flex border-t border-border">
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Редактировать
                </button>
                <div className="w-px bg-secondary" />
                <button
                    type="button"
                    onClick={onDelete}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить
                </button>
            </div>
        </article>
    );
};

export default ProductCard;
