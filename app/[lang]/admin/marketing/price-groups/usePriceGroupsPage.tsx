'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';
import { useAdminLocale } from '@/lib/use-admin-locale';

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
    const { l } = useAdminLocale();
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
            .catch(() => setNotice({ type: 'error', text: l('Не удалось загрузить прайс-листы. Обновите страницу.', 'Failed to load price lists. Refresh the page.', 'Neizdevās ielādēt cenu lapas. Atsvaidziniet lapu.') }))
            .finally(() => setLoading(false));
    }, [l, request]);

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
        setNotice({ type: 'success', text: l('Ценовая группа создана.', 'Price group created.', 'Cenu grupa izveidota.') });
        } catch { setNotice({ type: 'error', text: l('Не удалось создать группу. Проверьте введённые данные.', 'Failed to create the group. Check the entered data.', 'Neizdevās izveidot grupu. Pārbaudiet ievadītos datus.') }); }
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
        setNotice({ type: 'success', text: l('Изменения сохранены.', 'Changes saved.', 'Izmaiņas saglabātas.') });
        } catch { setNotice({ type: 'error', text: l('Не удалось сохранить изменения.', 'Failed to save changes.', 'Neizdevās saglabāt izmaiņas.') }); }
        finally { setBusy(false); }
    };

    const handleDelete = async (id: string) => {
        const decision = await confirmAction({ title: l('Удалить ценовую группу?', 'Delete price group?', 'Dzēst cenu grupu?'), description: l('Группа и все её ценовые переопределения будут удалены.', 'The group and all its price overrides will be deleted.', 'Grupa un visi tās cenu pārrakstījumi tiks dzēsti.'), affected: [id], confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), requireReason: true, destructive: true });
        if (!decision.confirmed) return;
        setBusy(true);
        setNotice(null);
        try {
        await request(`/api/admin/price-groups/${id}`, { method: 'DELETE' });
        if (selectedGroup === id) setSelectedGroup(null);
        load();
        setNotice({ type: 'success', text: l('Ценовая группа удалена.', 'Price group deleted.', 'Cenu grupa dzēsta.') });
        } catch { setNotice({ type: 'error', text: l('Не удалось удалить группу.', 'Failed to delete the group.', 'Neizdevās dzēst grupu.') }); }
        finally { setBusy(false); }
    };

    const handleSetOverride = async (groupId: string, productId: string) => {
        const key = `${groupId}-${productId}`;
        const price = parseFloat(overrideInput[key] ?? '');
        if (!Number.isFinite(price) || price < 0) {
            setNotice({ type: 'error', text: l('Введите корректную цену не меньше нуля.', 'Enter a valid price of zero or more.', 'Ievadiet derīgu cenu, kas nav mazāka par nulli.') });
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
        setNotice({ type: 'success', text: l('Индивидуальная цена сохранена.', 'Custom price saved.', 'Individuālā cena saglabāta.') });
        } catch { setNotice({ type: 'error', text: l('Не удалось сохранить индивидуальную цену.', 'Failed to save the custom price.', 'Neizdevās saglabāt individuālo cenu.') }); }
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
        setNotice({ type: 'success', text: l('Индивидуальная цена удалена.', 'Custom price removed.', 'Individuālā cena noņemta.') });
        } catch { setNotice({ type: 'error', text: l('Не удалось удалить индивидуальную цену.', 'Failed to remove the custom price.', 'Neizdevās noņemt individuālo cenu.') }); }
        finally { setBusy(false); }
    };

    const discountLabel = (m: number) => {
        if (m === 1) return l('Без скидки', 'No discount', 'Bez atlaides');
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
