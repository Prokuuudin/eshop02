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

interface ProductsToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    viewMode: string;
    setViewMode: (mode: string) => void;
    language?: Language;
    archiveCount?: number;
    onToggleArchive?: () => void;
    archiveOpen?: boolean;
    archiveItems?: any[];
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
    const placeholder = translations[language]['admin.products.searchPlaceholder'] || '';
    return (
        <div className="admin-products__toolbar mt-4 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-2 w-full md:w-[480px]">
                <Input
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={placeholder}
                    className="h-9 flex-1"
                />
                <IconSearch className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {translations[language]['catalog.search'] || 'Поиск'}
                </span>
            </div>
            <div className="hidden md:block h-8 border-l border-gray-300 dark:border-gray-700 mx-2" />
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {(translations[language]['admin.productsPage.viewModeTitle'] || 'Выбор вида') +
                        ':'}
                </span>
                <Button
                    size="sm"
                    variant={viewMode === 'cards' ? 'default' : 'outline'}
                    onClick={() => setViewMode('cards')}
                >
                    <IconGrid className="mr-2" />
                    {translations[language]['admin.productsPage.cardsBtn'] || 'Карточки'}
                </Button>
                <Button
                    size="sm"
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    onClick={() => setViewMode('list')}
                >
                    <IconList className="mr-2" />
                    {translations[language]['admin.productsPage.listBtn'] || 'Список'}
                </Button>
            </div>
            <div className="hidden md:block h-8 border-l border-gray-300 dark:border-gray-700 mx-2" />
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {(translations[language]['admin.productsPage.archiveTitleShort'] ||
                        'Удаленные товары') + ':'}
                </span>
                <Dialog open={archiveOpen} onOpenChange={onToggleArchive}>
                    <DialogTrigger asChild>
                        <Button
                            size="sm"
                            variant={archiveOpen ? 'default' : 'outline'}
                            className="ml-2 relative"
                            title={
                                translations[language]['admin.productsPage.archiveBtnTitle'] ||
                                'Корзина удалённых товаров'
                            }
                        >
                            <IconTrash className="mr-2 fill-red-500 text-red-500" />
                            {translations[language]['admin.productsPage.archiveBtn'] || 'Корзина'}
                            {archiveCount > 0 && (
                                <Badge className="ml-2 px-2 py-0.5 text-xs absolute -top-2 -right-2 bg-red-500 text-white">
                                    {archiveCount}
                                </Badge>
                            )}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl w-full rounded-2xl p-8 bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-gray-800">
                        <DialogHeader className="flex flex-row items-center justify-between mb-4 p-0">
                            <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {translations[language]['admin.productsPage.archiveTitle'] ||
                                    'Корзина удалённых товаров'}
                            </DialogTitle>
                            <DialogClose asChild>
                                <button
                                    aria-label="Закрыть"
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
