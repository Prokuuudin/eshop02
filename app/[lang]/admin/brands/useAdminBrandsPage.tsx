'use client';

import React from 'react';
import type {
    BrandConfigItem,
    BrandsConfigPayload,
    LocalizedBrandDescription,
    BrandManufacturerInfo,
} from '@/lib/brands-config';
import { useTranslation } from '@/lib/use-translation';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';

type NewBrandDraft = {
    id: string;
    name: string;
    logo: string;
    isDistributor: boolean;
    allowLogo: boolean;
    descriptionRu: string;
    descriptionEn: string;
    descriptionLv: string;
};

const EMPTY_NEW_BRAND: NewBrandDraft = {
    id: '',
    name: '',
    logo: '/brands/new-brand.svg',
    isDistributor: false,
    allowLogo: true,
    descriptionRu: '',
    descriptionEn: '',
    descriptionLv: '',
};

const sanitizeSlug = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');

const normalizeDescription = (ru: string, en: string, lv: string): LocalizedBrandDescription => {
    const normalizedRu = ru.trim();
    const normalizedEn = en.trim() || normalizedRu;
    const normalizedLv = lv.trim() || normalizedRu;
    return { ru: normalizedRu, en: normalizedEn, lv: normalizedLv };
};

function useAdminBrandsPageState() {
    const confirmAction = useAdminConfirm();
    const { t, language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const tl = (
        key: string,
        ru: string,
        en: string,
        lv: string,
        params?: Record<string, string | number>
    ) => t(key, l(ru, en, lv), params);

    const [brands, setBrands] = React.useState<BrandConfigItem[]>([]);
    const [savedBrands, setSavedBrands] = React.useState<BrandConfigItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const [newBrand, setNewBrand] = React.useState<NewBrandDraft>(EMPTY_NEW_BRAND);
    const [search, setSearch] = React.useState('');

    const q = search.trim().toLowerCase();
    const filteredBrands = q
        ? brands.filter((b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
        : brands;

    React.useEffect(() => {
        const loadBrands = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/admin/brands', { cache: 'no-store' });
                if (!response.ok) throw new Error('failed_to_load_brands');
                const payload = (await response.json()) as Partial<BrandsConfigPayload>;
                const nextBrands = payload.brands ?? [];
                setBrands(nextBrands);
                setSavedBrands(nextBrands);
                setError('');
            } catch {
                setError(
                    t(
                        'admin.brands.msg.loadFailed',
                        language === 'ru'
                            ? 'Не удалось загрузить бренды'
                            : language === 'lv'
                            ? 'Neizdevās ielādēt zīmolus'
                            : 'Failed to load brands'
                    )
                );
            } finally {
                setLoading(false);
            }
        };

        queueMicrotask(() => void loadBrands());
    }, [language, t]);

    const saveBrands = async (nextBrands: BrandConfigItem[], successMessage: string) => {
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const response = await fetch('/api/admin/brands', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brands: nextBrands }),
            });
            if (!response.ok) throw new Error('failed_to_save_brands');

            const payload = (await response.json()) as Partial<BrandsConfigPayload>;
            const resolved = payload.brands ?? nextBrands;
            setBrands(resolved);
            setSavedBrands(resolved);
            setMessage(successMessage);
        } catch {
            setError(
                tl(
                    'admin.brands.msg.saveFailed',
                    'Не удалось сохранить изменения',
                    'Failed to save changes',
                    'Neizdevās saglabāt izmaiņas'
                )
            );
        } finally {
            setSaving(false);
        }
    };

    const updateBrand = (brandId: string, patch: Partial<BrandConfigItem>) => {
        setBrands((prev) =>
            prev.map((brand) => (brand.id === brandId ? { ...brand, ...patch } : brand))
        );
    };

    const updateBrandDescription = (brandId: string, patch: Partial<LocalizedBrandDescription>) => {
        setBrands((prev) =>
            prev.map((brand) =>
                brand.id === brandId
                    ? {
                          ...brand,
                          description: {
                              ...brand.description,
                              ...patch,
                          },
                      }
                    : brand
            )
        );
    };

    const updateBrandManufacturer = (brandId: string, patch: Partial<BrandManufacturerInfo>) => {
        setBrands((prev) =>
            prev.map((brand) =>
                brand.id === brandId
                    ? { ...brand, manufacturer: { ...brand.manufacturer, ...patch } }
                    : brand
            )
        );
    };

    const updateBrandDistributor = (brandId: string, patch: Partial<BrandManufacturerInfo>) => {
        setBrands((prev) =>
            prev.map((brand) =>
                brand.id === brandId
                    ? { ...brand, distributor: { ...brand.distributor, ...patch } }
                    : brand
            )
        );
    };

    const handleCreateBrand = async () => {
        const id = sanitizeSlug(newBrand.id);
        const name = newBrand.name.trim();
        const logo = newBrand.logo.trim();

        if (!id || !name || !logo) {
            setError(
                tl(
                    'admin.brands.msg.fillRequired',
                    'Заполните ID, название и логотип',
                    'Fill in ID, name, and logo',
                    'Aizpildiet ID, nosaukumu un logo'
                )
            );
            return;
        }

        if (brands.some((brand) => brand.id === id)) {
            setError(
                tl(
                    'admin.brands.msg.duplicateId',
                    'Бренд с таким ID уже существует',
                    'Brand with this ID already exists',
                    'Zīmols ar šo ID jau pastāv'
                )
            );
            return;
        }

        const next: BrandConfigItem[] = [
            ...brands,
            {
                id,
                name,
                logo,
                isDistributor: newBrand.isDistributor,
                allowLogo: newBrand.allowLogo,
                description: normalizeDescription(
                    newBrand.descriptionRu,
                    newBrand.descriptionEn,
                    newBrand.descriptionLv
                ),
            },
        ];

        await saveBrands(
            next,
            tl('admin.brands.msg.added', 'Бренд добавлен', 'Brand added', 'Zīmols pievienots')
        );
        setNewBrand(EMPTY_NEW_BRAND);
    };

    const handleSaveBrand = async () => {
        await saveBrands(
            brands,
            tl(
                'admin.brands.msg.changesSaved',
                'Изменения брендов сохранены',
                'Brand changes saved',
                'Zīmola izmaiņas saglabātas'
            )
        );
    };

    const handleResetBrand = (brandId: string) => {
        const saved = savedBrands.find((brand) => brand.id === brandId);
        if (!saved) {
            setError(
                tl(
                    'admin.brands.msg.savedVersionNotFound',
                    'Не найдена сохраненная версия бренда',
                    'Saved brand version not found',
                    'Saglabātā zīmola versija nav atrasta'
                )
            );
            return;
        }

        setBrands((prev) => prev.map((brand) => (brand.id === brandId ? saved : brand)));
        setMessage(
            tl(
                'admin.brands.msg.cardReset',
                'Изменения карточки бренда сброшены',
                'Brand card changes reset',
                'Zīmola kartītes izmaiņas atiestatītas'
            )
        );
        setError('');
    };

    const handleDeleteBrand = async (brandId: string) => {
        const decision = await confirmAction({
            title: tl(
                'admin.brands.msg.deleteConfirmWithId',
                'Удалить бренд {id}?',
                'Delete brand {id}?',
                'Vai dzēst zīmolu {id}?',
                { id: brandId }
            ),
            description: tl(
                'admin.brands.msg.deleteDescription',
                'Бренд будет удалён из каталога. Проверьте связанные товары перед продолжением.',
                'The brand will be removed from the catalog. Check related products before continuing.',
                'Zīmols tiks noņemts no kataloga. Pirms turpināt, pārbaudiet saistītos produktus.'
            ),
            affected: [brandId],
            confirmText: brandId,
            requireReason: true,
            destructive: true,
        });
        if (!decision.confirmed) return;

        const next = brands.filter((brand) => brand.id !== brandId);
        await saveBrands(
            next,
            tl('admin.brands.msg.deleted', 'Бренд удален', 'Brand deleted', 'Zīmols dzēsts')
        );
    };

    const newBrandTitle =
        newBrand.name.trim() ||
        sanitizeSlug(newBrand.id) ||
        tl('admin.brands.newBrandDefault', 'Новый бренд', 'New brand', 'Jauns zīmols');

    return {
        t,
        language,
        l,
        tl,
        brands,
        setBrands,
        savedBrands,
        setSavedBrands,
        loading,
        setLoading,
        saving,
        setSaving,
        message,
        setMessage,
        error,
        setError,
        newBrand,
        setNewBrand,
        search,
        setSearch,
        q,
        filteredBrands,
        saveBrands,
        updateBrand,
        updateBrandDescription,
        updateBrandManufacturer,
        updateBrandDistributor,
        handleCreateBrand,
        handleSaveBrand,
        handleResetBrand,
        handleDeleteBrand,
        newBrandTitle,
    };
}

export function useAdminBrandsPage(): ReturnType<typeof useAdminBrandsPageState> {
    return useAdminBrandsPageState();
}
