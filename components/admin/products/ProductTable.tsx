'use client';
import React, { useState } from 'react';
import type { Product } from '@/data/products';
import { Button } from '@/components/ui/button';

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

    const cellCls = 'px-2 py-1 w-24 rounded border border-indigo-300 dark:border-primary bg-white dark:bg-gray-800 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400'

    return (
        <div className="overflow-x-auto">
            <table className="admin-products__table min-w-full border border-border rounded-lg">
                <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">Картинка</th>
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">Название</th>
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">ID / SKU</th>
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                            Цена, €
                            {onQuickSave && <span className="ml-1 text-xs font-normal text-gray-400">(клик)</span>}
                        </th>
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">
                            Остаток
                            {onQuickSave && <span className="ml-1 text-xs font-normal text-gray-400">(клик)</span>}
                        </th>
                        <th className="p-3 text-left font-semibold text-sm text-gray-700 dark:text-gray-200">Действия</th>
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
                                className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'} ${isSaving ? 'opacity-60' : ''}`}
                            >
                                <td className="p-3 align-middle">
                                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                        {product.image
                                            ? <img src={product.image} alt={product.title} className="object-cover w-full h-full" />
                                            : <span className="text-xs text-gray-400">—</span>
                                        }
                                    </div>
                                </td>
                                <td className="p-3 align-middle max-w-xs font-medium text-foreground">
                                    <span className="truncate block">{product.title}</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">{product.brand}</span>
                                </td>
                                <td className="p-3 align-middle">
                                    <span className="block text-xs text-muted-foreground font-mono">{product.id}</span>
                                    {product.sku && <span className="block text-xs text-gray-400 dark:text-gray-500 font-mono">{product.sku}</span>}
                                </td>
                                <td className="p-3 align-middle">
                                    {isEditingPrice ? (
                                        <input
                                            autoFocus
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
                                            title={onQuickSave ? 'Кликните для редактирования' : undefined}
                                            className={`text-sm font-medium text-foreground tabular-nums ${onQuickSave ? 'rounded px-1.5 py-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-primary/90 cursor-pointer' : 'cursor-default'}`}
                                        >
                                            €{product.price.toFixed(2)}
                                        </button>
                                    )}
                                </td>
                                <td className="p-3 align-middle">
                                    {isEditingStock ? (
                                        <input
                                            autoFocus
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
                                            title={onQuickSave ? 'Кликните для редактирования' : undefined}
                                            className={`text-sm tabular-nums ${onQuickSave ? 'rounded px-1.5 py-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer' : 'cursor-default'} ${product.stock === 0 ? 'text-red-600 dark:text-red-400 font-semibold' : product.stock <= 5 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-foreground'}`}
                                        >
                                            {product.stock}
                                        </button>
                                    )}
                                </td>
                                <td className="p-3 align-middle">
                                    <div className="flex gap-2 flex-wrap">
                                        <Button size="sm" onClick={() => onEditProduct?.(product)}>Изменить</Button>
                                        <Button size="sm" variant="destructive" onClick={() => onDeleteProduct?.(product)}>Удалить</Button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            {products.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 mt-4">
                    Нет результатов поиска
                </div>
            )}
        </div>
    )
}

export default ProductTable;
