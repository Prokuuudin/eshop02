export type Product = {
    id: string;
    revision: number;
    title: string;
    brand: string;
    category: string;
    price: number;
    oldPrice?: number;
    sku?: string;
};

export type AdjustMode = 'percent' | 'fixed_add' | 'fixed_set';
export type OldPriceAction = 'save_current' | 'clear';

export type ResultItem = {
    id: string;
    title: string;
    sku?: string;
    oldPrice: number;
    newPrice: number;
    status: 'ok' | 'err';
    error?: string;
    httpStatus?: number;
};

export type LastResult = {
    kind: 'apply' | 'revert';
    appliedAt: Date;
    description: string;
    ok: number;
    err: number;
    items: ResultItem[];
    mode?: AdjustMode;
    value?: number;
    oldPriceAction?: OldPriceAction;
};

export type PriceSnapshot = { price: number; oldPrice: number | null };

export type ServerBatchItem = {
    id: string;
    title: string;
    before: PriceSnapshot;
    after: PriceSnapshot;
    state: 'available' | 'reverted' | 'changed';
};

export type ServerBatch = {
    requestId: string;
    appliedAt: string;
    adminEmail: string;
    adminName: string | null;
    action: string;
    items: ServerBatchItem[];
    revertState: 'available' | 'partial' | 'reverted' | 'not_available';
};

export type PendingAction = { type: 'apply' } | { type: 'revert'; batch: ServerBatch };

export const PAGE_SIZE = 100;
const UPDATE_CONCURRENCY = 8;

export async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(UPDATE_CONCURRENCY, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

export function formatMoney(v: number, locale: string): string {
    return v.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calcNewPrice(price: number, mode: AdjustMode, value: number): number {
    if (mode === 'percent') return Math.max(0, Math.round((price * (1 + value / 100)) * 100) / 100);
    if (mode === 'fixed_add') return Math.max(0, Math.round((price + value) * 100) / 100);
    return Math.max(0, value);
}

export function describeChange(mode: AdjustMode, value: number, oldPriceAction: OldPriceAction, locale: string, l: (ru: string, en: string, lv: string) => string): string {
    if (!Number.isFinite(value) && oldPriceAction === 'clear') return l('Убрать зачёркнутую цену', 'Remove crossed-out price', 'Noņemt pārsvītroto cenu');
    const base = mode === 'percent'
        ? `${value > 0 ? '+' : ''}${value}%`
        : mode === 'fixed_add'
            ? `${value > 0 ? '+' : ''}${formatMoney(value, locale)}`
            : `${l('цена', 'price', 'cena')} = ${formatMoney(value, locale)}`;
    if (oldPriceAction === 'save_current') return `${base}, ${l('старая цена зачёркнута', 'old price crossed out', 'vecā cena pārsvītrota')}`;
    return `${base}, ${l('старая цена убрана', 'old price removed', 'vecā cena noņemta')}`;
}

