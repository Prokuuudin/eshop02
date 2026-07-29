'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddProductFormValues } from './productFormSchema';
import type { AdminProductSearchItem } from '@/app/api/admin/products/search/route';

type PickerFieldName = 'relatedProductIds' | 'oftenBoughtTogether';

interface ProductPickerProps {
    name: PickerFieldName;
    title: string;
    hint?: string;
}

// Пикер товаров по поиску: чипы выбранных + строка поиска с подсказками.
// Значение в форме остаётся string[] с ID товаров.
const ProductPicker: React.FC<ProductPickerProps> = ({ name, title, hint }) => {
    const { watch, setValue, getValues } = useFormContext<AddProductFormValues>();
    const selectedIds: string[] = watch(name) ?? [];

    const [infoById, setInfoById] = useState<Record<string, AdminProductSearchItem>>({});
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<AdminProductSearchItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const cacheItems = useCallback((items: AdminProductSearchItem[]) => {
        setInfoById((prev) => {
            const next = { ...prev };
            for (const item of items) next[item.id] = item;
            return next;
        });
    }, []);

    // Резолв названий для ID, которых ещё нет в кеше (начальные значения формы)
    useEffect(() => {
        const unknown = selectedIds.filter((id) => !infoById[id]);
        if (unknown.length === 0) return;
        let cancelled = false;
        fetch(`/api/admin/products/search?ids=${encodeURIComponent(unknown.join(','))}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (cancelled || !json?.data?.products) return;
                cacheItems(json.data.products);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds.join(',')]);

    // Поиск с дебаунсом
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) {
            debounceRef.current = setTimeout(() => {
                setSuggestions([]);
                setIsLoading(false);
            }, 0);
            return;
        }
        debounceRef.current = setTimeout(() => {
            setIsLoading(true);
            fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((json) => {
                    const items: AdminProductSearchItem[] = json?.data?.products ?? [];
                    cacheItems(items);
                    setSuggestions(items);
                })
                .catch(() => setSuggestions([]))
                .finally(() => setIsLoading(false));
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, cacheItems]);

    // Закрытие подсказок по клику вне пикера
    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const currentIds = () => (getValues(name) ?? []) as string[];

    const addProduct = (item: AdminProductSearchItem) => {
        const formId = getValues('id');
        if (item.id === formId) return; // товар не ссылается сам на себя
        const ids = currentIds();
        if (ids.includes(item.id)) return;
        setValue(name, [...ids, item.id], { shouldDirty: true, shouldValidate: true });
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
    };

    const removeProduct = (id: string) => {
        setValue(name, currentIds().filter((x) => x !== id), {
            shouldDirty: true,
            shouldValidate: true,
        });
    };

    return (
        <div className={`add-product__section add-product__section--${name}`} ref={rootRef}>
            <h2 className="add-product__section-title">{title}</h2>
            {hint && <p className="text-sm text-muted-foreground mb-2">{hint}</p>}

            {selectedIds.length > 0 && (
                <ul className="product-picker__chips flex flex-col gap-1.5 mb-2">
                    {selectedIds.map((id) => {
                        const info = infoById[id];
                        return (
                            <li
                                key={id}
                                className="product-picker__chip flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                            >
                                {info?.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={info.image}
                                        alt=""
                                        className="product-picker__chip-image h-8 w-8 rounded object-cover shrink-0"
                                    />
                                ) : (
                                    <span className="product-picker__chip-image h-8 w-8 rounded bg-muted shrink-0" />
                                )}
                                <span className="product-picker__chip-title flex-1 min-w-0 truncate text-sm">
                                    {info ? info.title : `ID ${id}`}
                                </span>
                                {info && !info.isActive && (
                                    <Badge variant="secondary" className="shrink-0">
                                        скрыт
                                    </Badge>
                                )}
                                <span className="product-picker__chip-id text-xs text-muted-foreground shrink-0">
                                    {id}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 px-2"
                                    aria-label="Убрать товар"
                                    onClick={() => removeProduct(id)}
                                >
                                    ✕
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="product-picker__search relative">
                <Input
                    value={query}
                    placeholder="Поиск по названию, бренду, ID или SKU…"
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsOpen(false);
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (suggestions.length > 0) addProduct(suggestions[0]);
                        }
                    }}
                />
                {isOpen && query.trim().length >= 2 && (
                    <ul className="product-picker__suggestions absolute left-0 right-0 top-full mt-1 z-dropdown max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-md">
                        {isLoading && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">Поиск…</li>
                        )}
                        {!isLoading && suggestions.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">
                                Ничего не найдено
                            </li>
                        )}
                        {!isLoading &&
                            suggestions.map((item) => {
                                const alreadySelected = selectedIds.includes(item.id);
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            disabled={alreadySelected}
                                            className="product-picker__suggestion flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent disabled:opacity-50 disabled:cursor-default"
                                            onClick={() => addProduct(item)}
                                        >
                                            {item.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={item.image}
                                                    alt=""
                                                    className="h-8 w-8 rounded object-cover shrink-0"
                                                />
                                            ) : (
                                                <span className="h-8 w-8 rounded bg-muted shrink-0" />
                                            )}
                                            <span className="flex-1 min-w-0">
                                                <span className="block truncate text-sm">
                                                    {item.title}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {item.brand} · ID {item.id}
                                                    {alreadySelected ? ' · уже добавлен' : ''}
                                                </span>
                                            </span>
                                            {!item.isActive && (
                                                <Badge variant="secondary" className="shrink-0">
                                                    скрыт
                                                </Badge>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default ProductPicker;
