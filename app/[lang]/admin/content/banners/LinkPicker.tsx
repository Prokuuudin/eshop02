'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminLocale } from '@/lib/use-admin-locale';
import type { AdminProductSearchItem } from '@/app/api/admin/products/search/route';
import type { CategoriesConfigPayload } from '@/lib/categories-config';

type LinkPickerProps = {
    value: string;
    onChange: (next: string) => void;
};

export function LinkPicker({ value, onChange }: LinkPickerProps): React.ReactElement {
    const { language, l } = useAdminLocale();
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [products, setProducts] = React.useState<AdminProductSearchItem[]>([]);
    const [searching, setSearching] = React.useState(false);
    const [categories, setCategories] = React.useState<CategoriesConfigPayload['categories'] | null>(null);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    React.useEffect(() => {
        if (!open || categories !== null) return;
        fetch('/api/admin/categories', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: CategoriesConfigPayload | null) => setCategories(json?.categories ?? []))
            .catch(() => setCategories([]));
    }, [open, categories]);

    React.useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) {
            debounceRef.current = setTimeout(() => {
                setProducts([]);
                setSearching(false);
            }, 0);
            return;
        }
        debounceRef.current = setTimeout(() => {
            setSearching(true);
            fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((json) => setProducts(json?.data?.products ?? []))
                .catch(() => setProducts([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const pick = (path: string) => {
        onChange(path);
        setOpen(false);
        setQuery('');
        setProducts([]);
    };

    return (
        <>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {l('Выбрать страницу', 'Choose a page', 'Izvēlēties lapu')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{l('Выбрать страницу для ссылки', 'Choose a page to link to', 'Izvēlēties lapu, uz kuru vest')}</DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="product">
                        <TabsList>
                            <TabsTrigger value="product">{l('Товар', 'Product', 'Prece')}</TabsTrigger>
                            <TabsTrigger value="category">{l('Категория', 'Category', 'Kategorija')}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="product" className="mt-3 space-y-2">
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={l('Поиск по названию, бренду, ID или SKU…', 'Search by name, brand, ID or SKU…', 'Meklēt pēc nosaukuma, zīmola, ID vai SKU…')}
                            />
                            <ul className="max-h-72 space-y-1 overflow-y-auto">
                                {searching && (
                                    <li className="px-2 py-2 text-sm text-muted-foreground">{l('Поиск…', 'Searching…', 'Meklē…')}</li>
                                )}
                                {!searching && query.trim().length >= 2 && products.length === 0 && (
                                    <li className="px-2 py-2 text-sm text-muted-foreground">{l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}</li>
                                )}
                                {!searching && products.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
                                            onClick={() => pick(`/product/${item.id}`)}
                                        >
                                            {item.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={item.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                                            ) : (
                                                <span className="h-8 w-8 shrink-0 rounded bg-muted" />
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">{item.title}</span>
                                                <span className="block text-xs text-muted-foreground">{item.brand} · {l('ID', 'ID', 'ID')} {item.id}</span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </TabsContent>
                        <TabsContent value="category" className="mt-3">
                            <ul className="max-h-80 space-y-1 overflow-y-auto">
                                {categories === null && (
                                    <li className="px-2 py-2 text-sm text-muted-foreground">{l('Загрузка…', 'Loading…', 'Ielādē…')}</li>
                                )}
                                {categories?.map((category) => (
                                    <li key={category.id}>
                                        <button
                                            type="button"
                                            className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${value === category.href ? 'bg-accent' : ''}`}
                                            onClick={() => pick(category.href)}
                                        >
                                            <span>{category.labels[language]}</span>
                                            <span className="text-xs text-muted-foreground">{category.href}</span>
                                        </button>
                                        {category.subcategories.length > 0 && (
                                            <ul className="ml-3 space-y-0.5 border-l border-border pl-2">
                                                {category.subcategories.map((sub) => {
                                                    const subHref = `${category.href}?subcat=${encodeURIComponent(sub.slug)}`;
                                                    return (
                                                        <li key={sub.slug}>
                                                            <button
                                                                type="button"
                                                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${value === subHref ? 'bg-accent' : ''}`}
                                                                onClick={() => pick(subHref)}
                                                            >
                                                                <span>{sub.labels[language]}</span>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </>
    );
}
