'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/data/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductTableProps {
    products: Product[];
    onEditProduct?: (product: Product) => void;
    onDeleteProduct?: (product: Product) => void;
    onQuickSave?: (id: string, changes: { price?: number; stock?: number }) => Promise<void>;
}

type EditingCell = { id: string; field: 'price' | 'stock' }

const ProductTable: React.FC<ProductTableProps> = ({
    products,
    onEditProduct,
    onDeleteProduct,
    onQuickSave,
}) => {
    const { l } = useAdminLocale()
    const [editing, setEditing] = useState<EditingCell | null>(null)
    const [editValue, setEditValue] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)

    const startEdit = (product: Product, field: 'price' | 'stock') => {
        setEditing({ id: product.id, field })
        setEditValue(String(field === 'price' ? product.price : product.stock))
    }

    const commitEdit = async (product: Product) => {
        if (!editing || editing.id !== product.id) return
        const raw = parseFloat(editValue)
        if (!Number.isFinite(raw) || raw < 0) { setEditing(null); return }
        const val = editing.field === 'stock' ? Math.floor(raw) : Math.round(raw * 100) / 100
        const original = editing.field === 'price' ? product.price : product.stock
        setEditing(null)
        if (val === original) return
        if (!onQuickSave) return
        setSavingId(product.id)
        try {
            await onQuickSave(product.id, { [editing.field]: val })
        } finally {
            setSavingId(null)
        }
    }

    const handleKey = (e: React.KeyboardEvent, product: Product) => {
        if (e.key === 'Enter') { e.preventDefault(); void commitEdit(product) }
        if (e.key === 'Escape') setEditing(null)
    }

    const cellCls = 'h-8 px-2 py-1 w-24 border-primary/50 dark:border-primary text-sm'

    return (
        <div className="overflow-x-auto">
            <table className="admin-products__table min-w-full border border-border rounded-lg">
                <thead>
                    <tr className="bg-muted">
                        <th className="p-3 text-left font-semibold text-sm text-foreground">{l('Картинка', 'Image', 'Attēls')}</th>
                        <th className="p-3 text-left font-semibold text-sm text-foreground">{l('Название', 'Name', 'Nosaukums')}</th>
                        <th className="p-3 text-left font-semibold text-sm text-foreground">ID / SKU</th>
                        <th className="p-3 text-left font-semibold text-sm text-foreground">
                            {l('Цена, €', 'Price, €', 'Cena, €')}
                            {onQuickSave && <span className="ml-1 text-xs font-normal text-muted-foreground">{l('(клик)', '(click)', '(klikšķis)')}</span>}
                        </th>
                        <th className="p-3 text-left font-semibold text-sm text-foreground">
                            {l('Остаток', 'Stock', 'Atlikums')}
                            {onQuickSave && <span className="ml-1 text-xs font-normal text-muted-foreground">{l('(клик)', '(click)', '(klikšķis)')}</span>}
                        </th>
                        <th className="p-3 text-left font-semibold text-sm text-foreground">{l('Действия', 'Actions', 'Darbības')}</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((product, idx) => {
                        const isSaving = savingId === product.id
                        const isEditingPrice = editing?.id === product.id && editing.field === 'price'
                        const isEditingStock = editing?.id === product.id && editing.field === 'stock'

                        return (
                            <tr
                                key={product.id}
                                className={`${idx % 2 === 0 ? 'bg-card' : 'bg-muted'} ${isSaving ? 'opacity-60' : ''}`}
                            >
                                <td className="p-3 align-middle">
                                    <div className="product-image-surface w-12 h-12 rounded overflow-hidden flex items-center justify-center shrink-0">
                                        {product.image
                                            ? <Image unoptimized src={product.image} alt={product.title} width={48} height={48} className="object-contain w-full h-full" />
                                            : <span className="text-xs text-muted-foreground">—</span>
                                        }
                                    </div>
                                </td>
                                <td className="p-3 align-middle max-w-xs font-medium text-foreground">
                                    <span className="truncate block">{product.title}</span>
                                    <span className="text-xs text-muted-foreground">{product.brand}</span>
                                    {product.isActive === false && (
                                        <span className="inline-block mt-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                            {l('Скрыт', 'Hidden', 'Paslēpts')}
                                        </span>
                                    )}
                                </td>
                                <td className="p-3 align-middle">
                                    <span className="block text-xs text-muted-foreground font-mono">{product.id}</span>
                                    {product.sku && <span className="block text-xs text-muted-foreground font-mono">{product.sku}</span>}
                                </td>
                                <td className="p-3 align-middle">
                                    {isEditingPrice ? (
                                        <Input
                                            ref={(element) => element?.focus()}
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => void commitEdit(product)}
                                            onKeyDown={(e) => handleKey(e, product)}
                                            className={cellCls}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onQuickSave && startEdit(product, 'price')}
                                            title={onQuickSave ? l('Кликните для редактирования', 'Click to edit', 'Klikšķiniet, lai rediģētu') : undefined}
                                            className={`text-sm font-medium text-foreground tabular-nums ${onQuickSave ? 'rounded px-1.5 py-0.5 hover:bg-primary/5 dark:hover:bg-primary/10 hover:text-primary/90 cursor-pointer' : 'cursor-default'}`}
                                        >
                                            €{product.price.toFixed(2)}
                                        </button>
                                    )}
                                </td>
                                <td className="p-3 align-middle">
                                    {isEditingStock ? (
                                        <Input
                                            ref={(element) => element?.focus()}
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => void commitEdit(product)}
                                            onKeyDown={(e) => handleKey(e, product)}
                                            className={cellCls}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onQuickSave && startEdit(product, 'stock')}
                                            title={onQuickSave ? l('Кликните для редактирования', 'Click to edit', 'Klikšķiniet, lai rediģētu') : undefined}
                                            className={`text-sm tabular-nums ${onQuickSave ? 'rounded px-1.5 py-0.5 hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer' : 'cursor-default'} ${product.stock === 0 ? 'text-red-600 dark:text-red-400 font-semibold' : product.stock <= 5 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-foreground'}`}
                                        >
                                            {product.stock}
                                        </button>
                                    )}
                                </td>
                                <td className="p-3 align-middle">
                                    <div className="flex gap-2 flex-wrap">
                                        <Button size="sm" onClick={() => onEditProduct?.(product)}>{l('Изменить', 'Edit', 'Rediģēt')}</Button>
                                        <Button size="sm" variant="destructive" onClick={() => onDeleteProduct?.(product)}>{l('Удалить', 'Delete', 'Dzēst')}</Button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            {products.length === 0 && (
                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground mt-4">
                    {l('Нет результатов поиска', 'No search results', 'Nav meklēšanas rezultātu')}
                </div>
            )}
        </div>
    )
}

export default ProductTable;
