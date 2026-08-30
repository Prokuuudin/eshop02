import type { RowAction } from '@/app/api/admin/import/preview/route';

export type ImportMode = 'create' | 'update' | 'upsert';
export type Localize = (ru: string, en: string, lv: string) => string;

export const REQUIRED_COLS = ['id', 'title', 'brand', 'price', 'stock', 'category'];
export const ALL_COLS = [
    ...REQUIRED_COLS,
    'titleEn', 'titleLv', 'sku', 'oldPrice', 'rating', 'ratingCount', 'image', 'badges',
    'description', 'specVolume', 'specType', 'specCountry', 'feature1', 'feature1En',
    'feature1Lv', 'feature2', 'feature2En', 'feature2Lv', 'feature3', 'feature3En',
    'feature3Lv', 'feature4', 'feature4En', 'feature4Lv', 'unitOfMeasure', 'packagingSize',
    'bonusRate', 'manufacturerName', 'manufacturerAddress', 'manufacturerEmail',
    'metaTitle', 'metaDescription',
];

export const ACTION_CHIPS: Record<RowAction, string> = {
    create: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    skip: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

