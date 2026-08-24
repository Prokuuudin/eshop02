import type { CustomerRow as ApiCustomerRow } from '@/app/api/admin/customers/route';

export type Segment = 'vip' | 'regular' | 'new' | 'inactive';
type Localize = (ru: string, en: string, lv: string) => string;
export type CustomerSort = 'lastOrderDate' | 'totalSpent' | 'totalOrders' | 'email';
export type FilterTab = 'all' | Segment;

export interface CustomerRow extends Omit<ApiCustomerRow, 'segment'> {
    segment: Segment;
}

export type BroadcastResult = { sent: number; failed: number; failedEmails: string[] };
export type SegmentAnalytics = {
    previousCounts: Record<Segment, number>;
    revenue: Record<Segment, number>;
    becameVip: number;
    becameInactive: number;
    comparisonDays: number;
};

export const SEGMENT_COLORS: Record<Segment, string> = {
    vip: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    regular: 'bg-blue-100 text-blue-800 border border-blue-300',
    new: 'bg-green-100 text-green-800 border border-green-300',
    inactive: 'bg-gray-100 text-gray-600 border border-gray-300',
};

export const SEGMENT_CARD_COLORS: Record<Segment, string> = {
    vip: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800',
    regular: 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800',
    new: 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800',
    inactive: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
};

export const EMPTY_ANALYTICS: SegmentAnalytics = {
    previousCounts: { vip: 0, regular: 0, new: 0, inactive: 0 },
    revenue: { vip: 0, regular: 0, new: 0, inactive: 0 },
    becameVip: 0,
    becameInactive: 0,
    comparisonDays: 30,
};

export function renderPreview(text: string, vars: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function getSegmentLabel(segment: Segment | 'all', l: Localize): string {
    if (segment === 'all') return l('Все', 'All', 'Visi');
    if (segment === 'vip') return 'VIP';
    if (segment === 'regular') return l('Постоянный', 'Regular', 'Pastāvīgs');
    if (segment === 'new') return l('Новый', 'New', 'Jauns');
    return l('Неактивный', 'Inactive', 'Neaktīvs');
}

export function getSegmentDescription(segment: Segment, l: Localize): string {
    if (segment === 'vip')
        return l('потратили более €500', 'spent more than €500', 'iztērējuši vairāk nekā €500');
    if (segment === 'regular')
        return l('более 3 заказов', 'more than 3 orders', 'vairāk nekā 3 pasūtījumi');
    if (segment === 'new')
        return l('до 3 заказов, активные', 'up to 3 orders, active', 'līdz 3 pasūtījumiem, aktīvi');
    return l(
        'не покупали более 180 дней',
        'no purchases for over 180 days',
        'nav pirkuši vairāk nekā 180 dienas'
    );
}

export function segmentReason(customer: CustomerRow, l: Localize): string {
    if (customer.segment === 'vip')
        return l(
            `Потрачено €${customer.totalSpent.toFixed(2)} — больше €500`,
            `Spent €${customer.totalSpent.toFixed(2)} — over €500`,
            `Iztērēti €${customer.totalSpent.toFixed(2)} — vairāk nekā €500`
        );
    if (customer.segment === 'regular')
        return l(
            `${customer.totalOrders} заказов — больше 3`,
            `${customer.totalOrders} orders — more than 3`,
            `${customer.totalOrders} pasūtījumi — vairāk nekā 3`
        );
    if (customer.segment === 'inactive' && customer.lastOrderDate) {
        const days = Math.max(
            0,
            Math.floor((Date.now() - new Date(customer.lastOrderDate).getTime()) / 86_400_000)
        );
        return l(
            `${days} дней без заказов — больше 180`,
            `${days} days without orders — over 180`,
            `${days} dienas bez pasūtījumiem — vairāk nekā 180`
        );
    }
    return l(
        `${customer.totalOrders} заказов и покупка за последние 180 дней`,
        `${customer.totalOrders} orders and a purchase in the last 180 days`,
        `${customer.totalOrders} pasūtījumi un pirkums pēdējās 180 dienās`
    );
}
