'use client';

import { useEffect, useState } from 'react';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';

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

function usePriceGroupsPageState() {
    const confirmAction = useAdminConfirm();
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
        const decision = await confirmAction({ title: 'Удалить ценовую группу?', description: 'Группа и все её ценовые переопределения будут удалены.', affected: [id], confirmText: 'УДАЛИТЬ', requireReason: true, destructive: true });
        if (!decision.confirmed) return;
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

    return {
        groups,
        setGroups,
        overrides,
        setOverrides,
        products,
        setProducts,
        loading,
        setLoading,
        showCreate,
        setShowCreate,
        editingId,
        setEditingId,
        selectedGroup,
        setSelectedGroup,
        productSearch,
        setProductSearch,
        overrideInput,
        setOverrideInput,
        load,
        handleCreate,
        handleUpdate,
        handleDelete,
        handleSetOverride,
        handleRemoveOverride,
        discountLabel,
        activeGroup,
        filteredProducts,
    };
}

export function usePriceGroupsPage(): ReturnType<typeof usePriceGroupsPageState> {
  return usePriceGroupsPageState()
}
