'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { translations, Language } from '@/data/translations';
import { IconGrid, IconList } from '@/components/ui/icon-view';
import IconSearch from '@/components/ui/icon-search';
import IconTrash from '@/components/ui/icon-trash';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
    DialogTrigger,
} from '@/components/ui/dialog';

import ArchivePanel from '@/components/admin/products/ArchivePanel';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductsToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    viewMode: string;
    setViewMode: (mode: string) => void;
    language?: Language;
    archiveCount?: number;
    onToggleArchive?: (open: boolean) => void;
    archiveOpen?: boolean;
    archiveItems?: ArchivedProductRecord[];
    onRestoreArchive?: (id: string) => void;
    onDeleteArchive?: (id: string) => void;
}

const ProductsToolbar: React.FC<ProductsToolbarProps> = ({
    searchQuery,
    onSearchChange,
    viewMode,
    setViewMode,
    language = 'ru',
    archiveCount = 0,
    onToggleArchive,
    archiveOpen = false,
    archiveItems = [],
    onRestoreArchive,
    onDeleteArchive,
}) => {
    const { l } = useAdminLocale();
    const placeholder = translations[language]['admin.products.searchPlaceholder'] || '';
    const [searchDraft, setSearchDraft] = React.useState(searchQuery);

    const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSearchChange(searchDraft.trim());
    };
    return (
        <div className="admin-products__toolbar mt-4 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <form className="flex items-center gap-2 w-full md:w-[480px]" role="search" onSubmit={submitSearch}>
                <Input
                    type="search"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder={placeholder}
                    aria-label={placeholder || l('Поиск товаров', 'Search products', 'Meklēt preces')}
                    className="h-9 flex-1"
                />
                <Button type="submit" size="sm" variant="outline" className="shrink-0">
                    <IconSearch className="mr-2 h-4 w-4" />
                    {translations[language]['catalog.search'] || l('Поиск', 'Search', 'Meklēt')}
                </Button>
            </form>
            <div className="hidden md:block h-8 border-l border-border mx-2" />
            <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">
                    {(translations[language]['admin.productsPage.viewModeTitle'] || l('Выбор вида', 'View', 'Skats')) +
                        ':'}
                </span>
                <Button
                    size="sm"
                    variant={viewMode === 'cards' ? 'default' : 'outline'}
                    onClick={() => setViewMode('cards')}
                >
                    <IconGrid className="mr-2" />
                    {translations[language]['admin.productsPage.cardsBtn'] || l('Карточки', 'Cards', 'Kartītes')}
                </Button>
                <Button
                    size="sm"
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    onClick={() => setViewMode('list')}
                >
                    <IconList className="mr-2" />
                    {translations[language]['admin.productsPage.listBtn'] || l('Список', 'List', 'Saraksts')}
                </Button>
            </div>
            <div className="hidden md:block h-8 border-l border-border mx-2" />
            <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">
                    {(translations[language]['admin.productsPage.archiveTitleShort'] ||
                        l('Удаленные товары', 'Deleted products', 'Dzēstās preces')) + ':'}
                </span>
                <Dialog open={archiveOpen} onOpenChange={(open) => onToggleArchive?.(open)}>
                    <DialogTrigger asChild>
                        <Button
                            size="sm"
                            variant={archiveOpen ? 'default' : 'outline'}
                            className="ml-2 relative"
                            title={
                                translations[language]['admin.productsPage.archiveBtnTitle'] ||
                                l('Корзина удалённых товаров', 'Deleted products', 'Dzēsto preču atkritne')
                            }
                        >
                            <IconTrash className="mr-2 fill-red-500 text-red-500" />
                            {translations[language]['admin.productsPage.archiveBtn'] || l('Корзина', 'Trash', 'Atkritne')}
                            {archiveCount > 0 && (
                                <Badge className="ml-2 px-2 py-0.5 text-xs absolute -top-2 -right-2 bg-red-500 text-white">
                                    {archiveCount}
                                </Badge>
                            )}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl w-full rounded-2xl p-4 sm:p-8 bg-card shadow-2xl border border-border">
                        <DialogHeader className="flex flex-row items-center justify-between mb-4 p-0">
                            <DialogTitle className="text-2xl font-bold text-foreground">
                                {translations[language]['admin.productsPage.archiveTitle'] ||
                                    l('Корзина удалённых товаров', 'Deleted products', 'Dzēsto preču atkritne')}
                            </DialogTitle>
                            <DialogClose asChild>
                                <button
                                    aria-label={l('Закрыть', 'Close', 'Aizvērt')}
                                    className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M5 5L15 15M15 5L5 15"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </button>
                            </DialogClose>
                        </DialogHeader>
                        <div className="py-2 px-1 max-h-[60vh] overflow-y-auto">
                            <ArchivePanel
                                archiveItems={archiveItems}
                                onRestore={onRestoreArchive || (() => {})}
                                onDelete={onDeleteArchive || (() => {})}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default ProductsToolbar;
