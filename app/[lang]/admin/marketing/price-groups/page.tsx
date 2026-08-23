'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/utils';

type PriceGroup = {
    id: string;
    name: string;
    description: string;
    multiplier: number;
    color: string;
    createdAt: string;
};

const COLOR_OPTIONS = ['#6b7280', '#059669', '#7c3aed', '#dc2626', '#2563eb', '#d97706', '#0891b2'];

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
                    <div className="mb-1 block text-xs text-muted-foreground">Название *</div>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                        placeholder="напр. Оптовый"
                    />
                </div>
                <div>
                    <div className="mb-1 block text-xs text-muted-foreground">
                        Множитель цены (1.0 = без скидки, 0.8 = −20%)
                    </div>
                    <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={multiplier}
                        onChange={(e) => setMultiplier(e.target.value)}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    />
                </div>
            </div>
            <div>
                <div className="mb-1 block text-xs text-muted-foreground">Описание</div>
                <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Краткое описание группы"
                />
            </div>
            <div>
                <div className="mb-1 block text-xs text-muted-foreground">Цвет метки</div>
                <div className="flex gap-2">
                    {COLOR_OPTIONS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={`h-7 w-7 rounded-full transition-transform ${
                                color === c ? 'scale-125 ring-2 ring-offset-1' : ''
                            }`}
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
                    className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50"
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}

import { usePriceGroupsPage } from './usePriceGroupsPage';

export default function PriceGroupsPage(): ReactElement {
    const pageState = usePriceGroupsPage();
    const {
            groups,
            overrides,
            loading,
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
          } = pageState;
    return (
        <AdminGate access="full">
            <div className="space-y-6">
                {notice && (
                    <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
                        {notice.text}
                    </div>
                )}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Прайс-листы по группам
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Управление ценовыми группами клиентов и индивидуальными ценами
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={busy || showCreate}
                        onClick={() => setShowCreate(true)}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Новая группа
                    </button>
                </div>

                {showCreate && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                        <h2 className="mb-3 text-sm font-semibold text-foreground">
                            Новая ценовая группа
                        </h2>
                        <GroupForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
                    </div>
                )}

                {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Загрузка...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {groups.length === 0 && (
                            <div className="col-span-full rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                                Ценовых групп пока нет. Создайте первую группу, чтобы настроить её цены.
                            </div>
                        )}
                        {groups.map((g) => {
                            const groupOverrides = overrides.filter((o) => o.groupId === g.id);
                            return (
                                <div
                                    key={g.id}
                                    role="button"
                                    tabIndex={0}
                                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                                        selectedGroup === g.id
                                            ? 'border-emerald-400 bg-emerald-50/40 shadow-sm dark:border-emerald-600 dark:bg-emerald-900/10'
                                            : 'border-gray-200 bg-white hover:border-border dark:bg-gray-900'
                                    }`}
                                    onClick={(event) => {
                                        if ((event.target as HTMLElement).closest('button, input'))
                                            return;
                                        setSelectedGroup(selectedGroup === g.id ? null : g.id);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget) return;
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            setSelectedGroup(selectedGroup === g.id ? null : g.id);
                                        }
                                    }}
                                >
                                    {editingId === g.id ? (
                                        <div>
                                            <GroupForm
                                                initial={g}
                                                onSave={(data) => handleUpdate(g.id, data)}
                                                onCancel={() => setEditingId(null)}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="h-3 w-3 rounded-full"
                                                        style={{ background: g.color }}
                                                    />
                                                    <span className="font-semibold text-foreground">
                                                        {g.name}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingId(g.id);
                                                        }}
                                                        className="rounded p-1 text-xs text-muted-foreground hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                                                    >
                                                        Ред.
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(g.id);
                                                        }}
                                                        className="rounded p-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                                    >
                                                        Удал.
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {g.description}
                                            </p>
                                            <div className="mt-3 flex items-center justify-between">
                                                <span
                                                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                                                    style={{ background: g.color }}
                                                >
                                                    {discountLabel(g.multiplier)}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {groupOverrides.length} перeopределений
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeGroup && (
                    <div className="rounded-xl border border-border bg-card">
                        <div className="border-b border-border px-4 py-3">
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold text-foreground">
                                    Цены для группы «{activeGroup.name}»
                                </h2>
                                <Input
                                    type="text"
                                    placeholder="Поиск товара..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    className="w-56 rounded-md border border-border px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100"
                                />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Базовый множитель: ×{activeGroup.multiplier} (
                                {discountLabel(activeGroup.multiplier)}). Укажите индивидуальную
                                цену для отдельных товаров.
                            </p>
                        </div>
                        <div className="max-h-[480px] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 border-b border-border bg-muted">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Товар
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                            Базовая
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                            Групповая
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                            Индив. цена
                                        </th>
                                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                            Действие
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filteredProducts.length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Товары не найдены.</td></tr>
                                    )}
                                    {filteredProducts.map((p) => {
                                        const ov = overrides.find(
                                            (o) =>
                                                o.groupId === activeGroup.id && o.productId === p.id
                                        );
                                        const groupPrice =
                                            Math.round(p.price * activeGroup.multiplier * 100) /
                                            100;
                                        const key = `${activeGroup.id}-${p.id}`;
                                        return (
                                            <tr
                                                key={p.id}
                                                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                            >
                                                <td className="px-4 py-2.5">
                                                    <div className="font-medium text-foreground">
                                                        {p.title}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {p.brand}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-muted-foreground">
                                                    {formatEuro(p.price, 'ru-RU')}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                                                    {formatEuro(groupPrice, 'ru-RU')}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {ov ? (
                                                        <span className="font-semibold text-violet-600 dark:text-violet-400">
                                                            {formatEuro(ov.price, 'ru-RU')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            placeholder="цена"
                                                            value={overrideInput[key] ?? ''}
                                                            onChange={(e) =>
                                                                setOverrideInput((prev) => ({
                                                                    ...prev,
                                                                    [key]: e.target.value,
                                                                }))
                                                            }
                                                            className="w-24 rounded-md border border-border px-2 py-1 text-xs dark:bg-gray-800 dark:text-gray-100"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                handleSetOverride(
                                                                    activeGroup.id,
                                                                    p.id
                                                                )
                                                            }
                                                            className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                                                        >
                                                            Сохр.
                                                        </button>
                                                        {ov && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleRemoveOverride(
                                                                        activeGroup.id,
                                                                        p.id
                                                                    )
                                                                }
                                                                className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:border-red-900/40"
                                                            >
                                                                ×
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </AdminGate>
    );
}
