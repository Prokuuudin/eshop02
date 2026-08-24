'use client';

import React from 'react';
import type {
    CategoriesConfigPayload,
    CategoryConfigItem,
    CategoryConfigSubcategory,
    LocalizedLabel,
} from '@/lib/categories-config';
import { useTranslation } from '@/lib/use-translation';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';

type NewCategoryDraft = {
    id: string;
    image: string;
    ru: string;
    en: string;
    lv: string;
    firstSubSlug: string;
    firstSubSearch: string;
    firstSubRu: string;
    firstSubEn: string;
    firstSubLv: string;
};

type NewSubDraft = {
    slug: string;
    search: string;
    ru: string;
    en: string;
    lv: string;
};

const EMPTY_NEW_CATEGORY: NewCategoryDraft = {
    id: '',
    image: '/categories/new.jpg',
    ru: '',
    en: '',
    lv: '',
    firstSubSlug: '',
    firstSubSearch: '',
    firstSubRu: '',
    firstSubEn: '',
    firstSubLv: '',
};

const sanitizeSlug = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');

const normalizeLabels = (ru: string, en: string, lv: string, fallback: string): LocalizedLabel => {
    const normalizedRu = ru.trim() || fallback;
    const normalizedEn = en.trim() || normalizedRu;
    const normalizedLv = lv.trim() || normalizedRu;
    return { ru: normalizedRu, en: normalizedEn, lv: normalizedLv };
};

function useAdminCategoriesPageState() {
    const confirmAction = useAdminConfirm();
    const { language, t } = useTranslation();
    const l = React.useCallback(
        (ru: string, en: string, lv: string) =>
            language === 'ru' ? ru : language === 'lv' ? lv : en,
        [language]
    );
    const tl = React.useCallback(
        (
            key: string,
            ru: string,
            en: string,
            lv: string,
            params?: Record<string, string | number>
        ) => t(key, l(ru, en, lv), params),
        [l, t]
    );

    const [categories, setCategories] = React.useState<CategoryConfigItem[]>([]);
    const [savedCategories, setSavedCategories] = React.useState<CategoryConfigItem[]>([]);
    const [deletedCategories, setDeletedCategories] = React.useState<CategoryConfigItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const [newCategory, setNewCategory] = React.useState<NewCategoryDraft>(EMPTY_NEW_CATEGORY);
    const [newSubByCategory, setNewSubByCategory] = React.useState<Record<string, NewSubDraft>>({});
    const newCategoryPreviewLabel =
        newCategory.ru.trim() ||
        newCategory.en.trim() ||
        newCategory.lv.trim() ||
        sanitizeSlug(newCategory.id) ||
        tl(
            'admin.categories.newCategoryFallback',
            'Новая категория',
            'New category',
            'Jauna kategorija'
        );

    React.useEffect(() => {
        const loadCategories = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/admin/categories', { cache: 'no-store' });
                if (!response.ok) throw new Error('failed_to_load_categories');
                const payload = (await response.json()) as Partial<CategoriesConfigPayload>;
                setCategories(payload.categories ?? []);
                setSavedCategories(payload.categories ?? []);
                setDeletedCategories(payload.deletedCategories ?? []);
                setError('');
            } catch {
                setError(
                    tl(
                        'admin.categories.msg.loadFailed',
                        'Не удалось загрузить категории',
                        'Failed to load categories',
                        'Neizdevās ielādēt kategorijas'
                    )
                );
            } finally {
                setLoading(false);
            }
        };

        void loadCategories();
    }, [tl]);

    const saveConfig = async (
        nextCategories: CategoryConfigItem[],
        nextDeletedCategories: CategoryConfigItem[],
        successMessage: string
    ) => {
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const response = await fetch('/api/admin/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categories: nextCategories,
                    deletedCategories: nextDeletedCategories,
                }),
            });
            if (!response.ok) throw new Error('failed_to_save_categories');

            const payload = (await response.json()) as Partial<CategoriesConfigPayload>;
            const resolvedCategories = payload.categories ?? nextCategories;
            setCategories(resolvedCategories);
            setSavedCategories(resolvedCategories);
            setDeletedCategories(payload.deletedCategories ?? nextDeletedCategories);
            setMessage(successMessage);
        } catch {
            setError(
                tl(
                    'admin.categories.msg.saveFailed',
                    'Не удалось сохранить изменения',
                    'Failed to save changes',
                    'Neizdevās saglabāt izmaiņas'
                )
            );
        } finally {
            setSaving(false);
        }
    };

    const updateCategoryLabels = (categoryId: string, nextLabels: Partial<LocalizedLabel>) => {
        setCategories((prev) =>
            prev.map((category) =>
                category.id === categoryId
                    ? {
                          ...category,
                          labels: {
                              ...category.labels,
                              ...nextLabels,
                          },
                      }
                    : category
            )
        );
    };

    const updateSubcategoryLabels = (
        categoryId: string,
        slug: string,
        nextLabels: Partial<LocalizedLabel>
    ) => {
        setCategories((prev) =>
            prev.map((category) => {
                if (category.id !== categoryId) return category;

                return {
                    ...category,
                    subcategories: category.subcategories.map((subcategory) =>
                        subcategory.slug === slug
                            ? {
                                  ...subcategory,
                                  labels: {
                                      ...subcategory.labels,
                                      ...nextLabels,
                                  },
                              }
                            : subcategory
                    ),
                };
            })
        );
    };

    const handleCreateCategory = async () => {
        const id = sanitizeSlug(newCategory.id);
        if (!id) {
            setError(
                tl(
                    'admin.categories.msg.idRequired',
                    'Укажите ID категории',
                    'Provide category ID',
                    'Norādiet kategorijas ID'
                )
            );
            return;
        }

        if (categories.some((category) => category.id === id)) {
            setError(
                tl(
                    'admin.categories.msg.idExists',
                    'Категория с таким ID уже существует',
                    'Category with this ID already exists',
                    'Kategorija ar šo ID jau pastāv'
                )
            );
            return;
        }

        const labels = normalizeLabels(newCategory.ru, newCategory.en, newCategory.lv, id);
        const firstSubSlug = sanitizeSlug(newCategory.firstSubSlug);
        const subcategories: CategoryConfigSubcategory[] = firstSubSlug
            ? [
                  {
                      slug: firstSubSlug,
                      labels: normalizeLabels(
                          newCategory.firstSubRu,
                          newCategory.firstSubEn,
                          newCategory.firstSubLv,
                          firstSubSlug
                      ),
                      search: newCategory.firstSubSearch.trim(),
                  },
              ]
            : [];

        const next: CategoryConfigItem[] = [
            ...categories,
            {
                id,
                href: `/catalog?cat=${id}`,
                image: newCategory.image.trim() || '/categories/new.jpg',
                labels,
                subcategories,
            },
        ];

        await saveConfig(
            next,
            deletedCategories,
            tl(
                'admin.categories.msg.created',
                'Категория создана',
                'Category created',
                'Kategorija izveidota'
            )
        );
        setNewCategory(EMPTY_NEW_CATEGORY);
    };

    const handleAddSubcategory = async (categoryId: string) => {
        const draft = newSubByCategory[categoryId];
        const slug = sanitizeSlug(draft?.slug ?? '');

        if (!slug) {
            setError(
                tl(
                    'admin.categories.msg.subSlugRequired',
                    'Укажите slug подпункта',
                    'Provide subcategory slug',
                    'Norādiet apakškategorijas slug'
                )
            );
            return;
        }

        const category = categories.find((item) => item.id === categoryId);
        if (!category) return;

        if (category.subcategories.some((subcategory) => subcategory.slug === slug)) {
            setError(
                tl(
                    'admin.categories.msg.subSlugExists',
                    'Подпункт с таким slug уже есть',
                    'Subcategory slug already exists',
                    'Apakškategorijas slug jau pastāv'
                )
            );
            return;
        }

        const next = categories.map((item) => {
            if (item.id !== categoryId) return item;

            return {
                ...item,
                subcategories: [
                    ...item.subcategories,
                    {
                        slug,
                        labels: normalizeLabels(
                            draft?.ru ?? '',
                            draft?.en ?? '',
                            draft?.lv ?? '',
                            slug
                        ),
                        search: draft?.search?.trim() ?? '',
                    },
                ],
            };
        });

        await saveConfig(
            next,
            deletedCategories,
            tl(
                'admin.categories.msg.subAdded',
                'Подпункт добавлен',
                'Subcategory added',
                'Apakškategorija pievienota'
            )
        );
        setNewSubByCategory((prev) => ({
            ...prev,
            [categoryId]: { slug: '', search: '', ru: '', en: '', lv: '' },
        }));
    };

    const handleRemoveSubcategory = async (categoryId: string, slug: string) => {
        const next = categories.map((item) => {
            if (item.id !== categoryId) return item;
            return {
                ...item,
                subcategories: item.subcategories.filter(
                    (subcategory) => subcategory.slug !== slug
                ),
            };
        });

        await saveConfig(
            next,
            deletedCategories,
            tl(
                'admin.categories.msg.subRemoved',
                'Подпункт удален',
                'Subcategory removed',
                'Apakškategorija dzēsta'
            )
        );
    };

    const handleSaveCategory = async () => {
        await saveConfig(
            categories,
            deletedCategories,
            tl(
                'admin.categories.msg.saved',
                'Изменения категории сохранены',
                'Category changes saved',
                'Kategorijas izmaiņas saglabātas'
            )
        );
    };

    const handleResetCategoryChanges = (categoryId: string) => {
        const savedCategory = savedCategories.find((item) => item.id === categoryId);
        if (!savedCategory) {
            setError(
                tl(
                    'admin.categories.msg.savedVersionMissing',
                    'Не удалось найти сохраненную версию категории',
                    'Saved category version not found',
                    'Saglabātā kategorijas versija nav atrasta'
                )
            );
            return;
        }

        setCategories((prev) =>
            prev.map((item) => (item.id === categoryId ? savedCategory : item))
        );
        setNewSubByCategory((prev) => {
            if (!prev[categoryId]) return prev;
            const next = { ...prev };
            delete next[categoryId];
            return next;
        });
        setError('');
        setMessage(
            tl(
                'admin.categories.msg.cardReset',
                'Изменения карточки сброшены',
                'Card changes were reset',
                'Kartītes izmaiņas atiestatītas'
            )
        );
    };

    const handleMoveCategoryToTrash = async (categoryId: string) => {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) return;

        const decision = await confirmAction({
            title: tl(
                'admin.categories.confirm.moveToTrash',
                'Переместить категорию {id} в корзину?',
                'Move category {id} to trash?',
                'Vai pārvietot kategoriju {id} uz atkritni?',
                { id: categoryId }
            ),
            description: tl(
                'admin.categories.confirm.moveToTrashDescription',
                'Категория исчезнет из активного каталога и будет перемещена в корзину.',
                'The category will disappear from the active catalog and move to trash.',
                'Kategorija pazudīs no aktīvā kataloga un tiks pārvietota uz atkritni.'
            ),
            affected: [categoryId],
            requireReason: true,
            destructive: true,
        });
        if (!decision.confirmed) return;

        const nextCategories = categories.filter((item) => item.id !== categoryId);
        const nextDeletedCategories = [
            ...deletedCategories.filter((item) => item.id !== categoryId),
            category,
        ];

        await saveConfig(
            nextCategories,
            nextDeletedCategories,
            tl(
                'admin.categories.msg.movedToTrash',
                'Категория перемещена в корзину',
                'Category moved to trash',
                'Kategorija pārvietota uz atkritni'
            )
        );
    };

    const handleRestoreCategory = async (categoryId: string) => {
        const category = deletedCategories.find((item) => item.id === categoryId);
        if (!category) return;

        if (categories.some((item) => item.id === categoryId)) {
            setError(
                tl(
                    'admin.categories.msg.idExistsActive',
                    'Категория с таким ID уже существует среди активных',
                    'Category with this ID already exists among active items',
                    'Kategorija ar šo ID jau ir aktīvajā sarakstā'
                )
            );
            return;
        }

        const nextCategories = [...categories, category];
        const nextDeletedCategories = deletedCategories.filter((item) => item.id !== categoryId);

        await saveConfig(
            nextCategories,
            nextDeletedCategories,
            tl(
                'admin.categories.msg.restored',
                'Категория восстановлена',
                'Category restored',
                'Kategorija atjaunota'
            )
        );
    };

    const handleDeleteCategoryForever = async (categoryId: string) => {
        const decision = await confirmAction({
            title: tl(
                'admin.categories.confirm.deleteForever',
                'Удалить категорию {id} из корзины навсегда?',
                'Delete category {id} from trash permanently?',
                'Vai neatgriezeniski dzēst kategoriju {id} no atkritnes?',
                { id: categoryId }
            ),
            description: tl(
                'admin.categories.confirm.deleteForeverDescription',
                'Категория будет удалена без возможности восстановления.',
                'The category will be deleted permanently and cannot be restored.',
                'Kategorija tiks neatgriezeniski dzēsta bez atjaunošanas iespējas.'
            ),
            affected: [categoryId],
            confirmText: categoryId,
            requireReason: true,
            destructive: true,
        });
        if (!decision.confirmed) return;

        const nextDeletedCategories = deletedCategories.filter((item) => item.id !== categoryId);
        await saveConfig(
            categories,
            nextDeletedCategories,
            tl(
                'admin.categories.msg.deletedFromTrash',
                'Категория удалена из корзины',
                'Category removed from trash',
                'Kategorija dzēsta no atkritnes'
            )
        );
    };

    return {
        language,
        t,
        l,
        tl,
        categories,
        setCategories,
        savedCategories,
        deletedCategories,
        loading,
        saving,
        message,
        error,
        newCategory,
        setNewCategory,
        newSubByCategory,
        setNewSubByCategory,
        newCategoryPreviewLabel,
        updateCategoryLabels,
        updateSubcategoryLabels,
        handleCreateCategory,
        handleAddSubcategory,
        handleRemoveSubcategory,
        handleSaveCategory,
        handleResetCategoryChanges,
        handleMoveCategoryToTrash,
        handleRestoreCategory,
        handleDeleteCategoryForever,
    };
}

export function useAdminCategoriesPage(): ReturnType<typeof useAdminCategoriesPageState> {
    return useAdminCategoriesPageState();
}
