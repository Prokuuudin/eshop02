import { ShoppingBag, ClipboardList, MapPinned, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Order } from '@/lib/orders-store'
import type { SavedAddress } from '@/lib/saved-addresses-store'
import { formatEuro } from '@/lib/utils'

type AccountSummaryCard = {
    title: string
    value: string
    caption: string
    icon: LucideIcon
}

function getAccountSummaryCardsImpl(
    t: (key: string) => string,
    tl: (key: string, ru: string, en: string, lv: string) => string,
    userOrders: Array<Order & { status?: string }>,
    savedAddresses: SavedAddress[],
    totalSpent: number,
    locale: string
): AccountSummaryCard[] {
    return [
        {
            title: t('account.myOrders'),
            value: String(userOrders.length),
            caption: tl('account.page.summary.totalOrders', 'Всего заказов', 'Total orders', 'Kopa pasutijumu'),
            icon: ShoppingBag,
        },
        {
            title: tl('account.page.summary.activeTitle', 'Активные', 'Active', 'Aktivi'),
            value: String(userOrders.filter((order) => {
                const status = order.status;
                return status !== 'delivered' && status !== 'cancelled';
            }).length),
            caption: tl('account.page.summary.activeCaption', 'В работе сейчас', 'Currently in progress', 'Paslaik apstrade'),
            icon: ClipboardList,
        },
        {
            title: tl('account.page.summary.addressesTitle', 'Адреса', 'Addresses', 'Adreses'),
            value: String(savedAddresses.length),
            caption: tl('account.page.summary.addressesCaption', 'Сохранено адресов', 'Saved addresses', 'Saglabatas adreses'),
            icon: MapPinned,
        },
        {
            title: tl('account.page.summary.turnoverTitle', 'Оборот', 'Turnover', 'Apgrozijums'),
            value: formatEuro(totalSpent, locale),
            caption: tl('account.page.summary.turnoverCaption', 'Сумма всех заказов', 'Total amount of all orders', 'Visu pasutijumu kopsumma'),
            icon: Package,
        },
    ];
}

export const getAccountSummaryCards: typeof getAccountSummaryCardsImpl = getAccountSummaryCardsImpl
