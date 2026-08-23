'use client';

import { useCallback, useEffect, useState } from 'react';
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
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const request = useCallback(async (url: string, options?: RequestInit) => {
        const response = await fetch(url, options);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'request_failed');
        return payload;
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        setNotice(null);
        Promise.all([
            request('/api/admin/price-groups'),
            request('/api/admin/products'),
        ])
            .then(([pgData, prods]) => {
                setGroups(pgData.groups ?? []);
                setOverrides(pgData.overrides ?? []);
                setProducts(Array.isArray(prods?.data?.products) ? prods.data.products : []);
            })
            .catch(() => setNotice({ type: 'error', text: 'Не удалось загрузить прайс-листы. Обновите страницу.' }))
            .finally(() => setLoading(false));
    }, [request]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) load();
        });
        return () => {
            cancelled = true;
        };
    }, [load]);

    const handleCreate = async (data: Omit<PriceGroup, 'id' | 'createdAt'>) => {
        setBusy(true);
        setNotice(null);
        try {
        await request('/api/admin/price-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        setShowCreate(false);
        load();
        setNotice({ type: 'success', text: 'Ценовая группа создана.' });
        } catch { setNotice({ type: 'error', text: 'Не удалось создать группу. Проверьте введённые данные.' }); }
        finally { setBusy(false); }
    };

    const handleUpdate = async (id: string, data: Omit<PriceGroup, 'id' | 'createdAt'>) => {
        setBusy(true);
        setNotice(null);
        try {
        await request(`/api/admin/price-groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        setEditingId(null);
        load();
        setNotice({ type: 'success', text: 'Изменения сохранены.' });
        } catch { setNotice({ type: 'error', text: 'Не удалось сохранить изменения.' }); }
        finally { setBusy(false); }
    };

    const handleDelete = async (id: string) => {
        const decision = await confirmAction({ title: 'Удалить ценовую группу?', description: 'Группа и все её ценовые переопределения будут удалены.', affected: [id], confirmText: 'УДАЛИТЬ', requireReason: true, destructive: true });
        if (!decision.confirmed) return;
        setBusy(true);
        setNotice(null);
        try {
        await request(`/api/admin/price-groups/${id}`, { method: 'DELETE' });
        if (selectedGroup === id) setSelectedGroup(null);
        load();
        setNotice({ type: 'success', text: 'Ценовая группа удалена.' });
        } catch { setNotice({ type: 'error', text: 'Не удалось удалить группу.' }); }
        finally { setBusy(false); }
    };

    const handleSetOverride = async (groupId: string, productId: string) => {
        const key = `${groupId}-${productId}`;
        const price = parseFloat(overrideInput[key] ?? '');
        if (!Number.isFinite(price) || price < 0) {
            setNotice({ type: 'error', text: 'Введите корректную цену не меньше нуля.' });
            return;
        }
        setBusy(true);
        setNotice(null);
        try {
        await request(`/api/admin/price-groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set_override', productId, price }),
        });
        setOverrideInput((previous) => ({ ...previous, [key]: '' }));
        load();
        setNotice({ type: 'success', text: 'Индивидуальная цена сохранена.' });
        } catch { setNotice({ type: 'error', text: 'Не удалось сохранить индивидуальную цену.' }); }
        finally { setBusy(false); }
    };

    const handleRemoveOverride = async (groupId: string, productId: string) => {
        setBusy(true);
        setNotice(null);
        try {
        await request(`/api/admin/price-groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove_override', productId }),
        });
        load();
        setNotice({ type: 'success', text: 'Индивидуальная цена удалена.' });
        } catch { setNotice({ type: 'error', text: 'Не удалось удалить индивидуальную цену.' }); }
        finally { setBusy(false); }
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
        busy,
        notice,
        setNotice,
    };
}

export function usePriceGroupsPage(): ReturnType<typeof usePriceGroupsPageState> {
  return usePriceGroupsPageState()
}
