'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { formatEuro } from '@/lib/utils';

type PriceGroup = {
    id: string;
    name: string;
    description: string;
    multiplier: number;
    color: string;
    createdAt: string;
};

type PriceOverride = {
    groupId: string;
    productId: string;
    price: number;
};

type Product = {
    id: string;
    title: string;
    brand: string;
    price: number;
    category: string;
};

const COLOR_OPTIONS = [
    '#6b7280', '#059669', '#7c3aed', '#dc2626', '#2563eb', '#d97706', '#0891b2',
];

function GroupForm({
    initial,
    onSave,
    onCancel,
}: {
    initial?: Partial<PriceGroup>;
    onSave: (data: Omit<PriceGroup, 'id' | 'createdAt'>) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [description, setDescription] = useState(initial?.description ?? '');
    const [multiplier, setMultiplier] = useState(String(initial?.multiplier ?? '1.0'));
    const [color, setColor] = useState(initial?.color ?? '#6b7280');

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <div className="mb-1 block text-xs text-gray-500">Название *</div>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="напр. Оптовый"
                    />
                </div>
                <div>
                    <div className="mb-1 block text-xs text-gray-500">
                        Множитель цены (1.0 = без скидки, 0.8 = −20%)
                    </div>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={multiplier}
                        onChange={(e) => setMultiplier(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                </div>
            </div>
            <div>
                <div className="mb-1 block text-xs text-gray-500">Описание</div>
                <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Краткое описание группы"
                />
            </div>
            <div>
                <div className="mb-1 block text-xs text-gray-500">Цвет метки</div>
                <div className="flex gap-2">
                    {COLOR_OPTIONS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1' : ''}`}
                            style={{ background: c }}
                        />
                    ))}
                </div>
            </div>
            <div className="flex gap-2 pt-1">
                <button
                    type="button"
                    onClick={() =>
                        onSave({
                            name,
                            description,
                            multiplier: parseFloat(multiplier) || 1,
                            color,
                        })
                    }
                    disabled={!name}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                    Сохранить
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}

export function usePriceGroupsPage() {
    const [groups, setGroups] = useState<PriceGroup[]>([]);
    const [overrides, setOverrides] = useState<PriceOverride[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [productSearch, setProductSearch] = useState('');
    const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});

    const load = () => {
        setLoading(true);
        Promise.all([
            fetch('/api/admin/price-groups').then((r) => r.json()),
            fetch('/api/admin/products').then((r) => r.json()),
        ])
            .then(([pgData, prods]) => {
                setGroups(pgData.groups ?? []);
                setOverrides(pgData.overrides ?? []);
                setProducts(Array.isArray(prods?.data?.products) ? prods.data.products : []);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) load();
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleCreate = async (data: Omit<PriceGroup, 'id' | 'createdAt'>) => {
        await fetch('/api/admin/price-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        setShowCreate(false);
        load();
    };

    const handleUpdate = async (id: string, data: Omit<PriceGroup, 'id' | 'createdAt'>) => {
        await fetch(`/api/admin/price-groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        setEditingId(null);
        load();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить группу и все её ценовые переопределения?')) return;
        await fetch(`/api/admin/price-groups/${id}`, { method: 'DELETE' });
        if (selectedGroup === id) setSelectedGroup(null);
        load();
    };

    const handleSetOverride = async (groupId: string, productId: string) => {
        const key = `${groupId}-${productId}`;
        const price = parseFloat(overrideInput[key] ?? '');
        if (!Number.isFinite(price) || price < 0) return;
        await fetch(`/api/admin/price-groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_override', productId, price }),
        });
        load();
    };

    const handleRemoveOverride = async (groupId: string, productId: string) => {
        await fetch(`/api/admin/price-groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove_override', productId }),
        });
        load();
    };

    const discountLabel = (m: number) => {
        if (m === 1) return 'Без скидки';
        if (m < 1) return `−${Math.round((1 - m) * 100)}%`;
        return `+${Math.round((m - 1) * 100)}%`;
    };

    const activeGroup = groups.find((g) => g.id === selectedGroup);
    const filteredProducts = products.filter((p) =>
        productSearch
            ? p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
              p.brand.toLowerCase().includes(productSearch.toLowerCase())
            : true
    );

      return { groups, setGroups, overrides, setOverrides, products, setProducts, loading, setLoading, showCreate, setShowCreate, editingId, setEditingId, selectedGroup, setSelectedGroup, productSearch, setProductSearch, overrideInput, setOverrideInput, load, handleCreate, handleUpdate, handleDelete, handleSetOverride, handleRemoveOverride, discountLabel, activeGroup, filteredProducts }
}
