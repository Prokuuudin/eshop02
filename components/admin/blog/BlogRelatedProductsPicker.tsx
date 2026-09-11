'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AdminProductSearchItem } from '@/app/api/admin/products/search/route';

type Props = {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    l: (ru: string, en: string, lv: string) => string;
};

// Тот же паттерн, что и components/admin/products/ProductPicker.tsx (чипы + поиск),
// но на локальном state вместо react-hook-form — форма блога не использует RHF.
export default function BlogRelatedProductsPicker({
    selectedIds,
    onChange,
    l,
}: Props): React.ReactElement {
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

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const addProduct = (item: AdminProductSearchItem): void => {
        if (selectedIds.includes(item.id)) return;
        onChange([...selectedIds, item.id]);
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
    };

    const removeProduct = (id: string): void => {
        onChange(selectedIds.filter((x) => x !== id));
    };

    return (
        <div ref={rootRef}>
            {selectedIds.length > 0 && (
                <ul className="flex flex-col gap-1.5 mb-2">
                    {selectedIds.map((id) => {
                        const info = infoById[id];
                        return (
                            <li
                                key={id}
                                className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                            >
                                {info?.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={info.image}
                                        alt=""
                                        className="h-8 w-8 rounded object-cover shrink-0"
                                    />
                                ) : (
                                    <span className="h-8 w-8 rounded bg-muted shrink-0" />
                                )}
                                <span className="flex-1 min-w-0 truncate text-sm">
                                    {info ? info.title : `ID ${id}`}
                                </span>
                                {info && !info.isActive && (
                                    <Badge variant="secondary" className="shrink-0">
                                        {l('скрыт', 'hidden', 'paslēpts')}
                                    </Badge>
                                )}
                                <span className="text-xs text-muted-foreground shrink-0">{id}</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 px-2"
                                    aria-label={l('Убрать товар', 'Remove product', 'Noņemt preci')}
                                    onClick={() => removeProduct(id)}
                                >
                                    ✕
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="relative">
                <Input
                    value={query}
                    aria-label={l(
                        'Найти и добавить связанный товар',
                        'Find and add a related product',
                        'Atrast un pievienot saistīto preci'
                    )}
                    placeholder={l(
                        'Поиск по названию, бренду, ID или SKU…',
                        'Search by name, brand, ID, or SKU…',
                        'Meklēt pēc nosaukuma, zīmola, ID vai SKU…'
                    )}
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
                    <ul className="absolute left-0 right-0 top-full mt-1 z-dropdown max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-md">
                        {isLoading && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">
                                {l('Поиск…', 'Searching…', 'Meklē…')}
                            </li>
                        )}
                        {!isLoading && suggestions.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">
                                {l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}
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
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent disabled:opacity-50 disabled:cursor-default"
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
                                                    {alreadySelected
                                                        ? ` · ${l(
                                                              'уже добавлен',
                                                              'already added',
                                                              'jau pievienota'
                                                          )}`
                                                        : ''}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </div>
        </div>
    );
}
