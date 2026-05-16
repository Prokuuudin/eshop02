export function getAccountSummaryCards(
    t: (key: string) => string,
    tl: (...args: any[]) => string,
    userOrders: any[],
    savedAddresses: any[],
    totalSpent: string | number,
    locale: string
) {
    return [
        {
            title: t('account.myOrders'),
            value: String(userOrders.length),
            caption: tl('account.page.summary.totalOrders', 'Всего заказов', 'Total orders', 'Kopa pasutijumu'),
            icon: require('lucide-react').ShoppingBag,
        },
        {
            title: tl('account.page.summary.activeTitle', 'Активные', 'Active', 'Aktivi'),
            value: String(userOrders.filter((order) => {
                const status = order.status;
                return status !== 'delivered' && status !== 'cancelled';
            }).length),
            caption: tl('account.page.summary.activeCaption', 'В работе сейчас', 'Currently in progress', 'Paslaik apstrade'),
            icon: require('lucide-react').ClipboardList,
        },
        {
            title: tl('account.page.summary.addressesTitle', 'Адреса', 'Addresses', 'Adreses'),
            value: String(savedAddresses.length),
            caption: tl('account.page.summary.addressesCaption', 'Сохранено адресов', 'Saved addresses', 'Saglabatas adreses'),
            icon: require('lucide-react').MapPinned,
        },
        {
            title: tl('account.page.summary.turnoverTitle', 'Оборот', 'Turnover', 'Apgrozijums'),
            value: String(totalSpent),
            caption: tl('account.page.summary.turnoverCaption', 'Сумма всех заказов', 'Total amount of all orders', 'Visu pasutijumu kopsumma'),
            icon: require('lucide-react').Package,
        },
    ];
}
