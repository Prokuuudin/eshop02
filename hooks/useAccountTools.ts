export function getAccountTools(user: any, tl: (...args: any[]) => string) {
    const tools = [
        {
            title: tl('account.page.tools.analytics.title', 'Статистика покупок', 'Purchase analytics', 'Pirkumu statistika'),
            description: tl('account.page.tools.analytics.description', 'Просмотр аналитики и динамики заказов', 'View analytics and order dynamics', 'Analitikas un pasutijumu dinamikas parskats'),
            href: '/account/analytics',
            linkLabel: tl('account.page.tools.analytics.linkLabel', 'Просмотр аналитики', 'View analytics', 'Skatit analitiku'),
            icon: require('lucide-react').Activity,
            classes: 'border-indigo-100 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/30',
            linkClasses: 'text-indigo-700 dark:text-indigo-300',
        },
        // ... (другие объекты)
    ];
    if (user?.companyId) {
        tools.push({
            title: tl('account.page.tools.rfq.title', 'Запрос спецпредложения (RFQ)', 'Special offer request (RFQ)', 'Ipaso piedavajumu pieprasijums (RFQ)'),
            description: tl('account.page.tools.rfq.description', 'Отправка запроса на персональные условия', 'Submit a request for custom terms', 'Nosutit pieprasijumu personalizetiem noteikumiem'),
            href: '/request-quote',
            linkLabel: tl('account.page.tools.rfq.linkLabel', 'Создать RFQ заявку', 'Create RFQ request', 'Izveidot RFQ pieprasijumu'),
            icon: require('lucide-react').CreditCard,
            classes: 'border-amber-100 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30',
            linkClasses: 'text-amber-700 dark:text-amber-300',
        });
    }
    return tools;
}
