export type AdminDashboardCard = {
    id: string;
    href: string;
    bg: string;
    border: string;
    adminOnly: boolean;
    title: string;
    description: string;
    linkText: string;
};

type DashboardCardTranslations = {
    t: (key: string) => string;
    l: (ru: string, en: string, lv: string) => string;
    tl: (key: string, ru: string, en: string, lv: string) => string;
};

export function getAdminDashboardCards({ t, l, tl }: DashboardCardTranslations): AdminDashboardCard[] {
    return [
        {
            id: 'orders',
            href: '/admin/orders',
            adminOnly: false,
            bg: 'bg-blue-50 dark:bg-blue-950/20',
            border: 'border-l-blue-500',
            title: tl('admin.dashboard.cards.orders.title', 'Заказы', 'Orders', 'Pasūtījumi'),
            description: tl('admin.dashboard.cards.orders.description', 'Управление заказами, статусами и оплатой', 'Manage orders, statuses and payments', 'Pasūtījumu, statusu un maksājumu pārvaldība'),
            linkText: tl('admin.dashboard.cards.orders.open', 'Открыть заказы', 'Open orders', 'Atvērt pasūtījumus'),
        },
        {
            id: 'rfq',
            href: '/admin/rfq',
            adminOnly: false,
            bg: 'bg-primary/5 dark:bg-primary/10',
            border: 'border-l-primary/70',
            title: 'B2B RFQ',
            description: tl('admin.dashboard.cards.rfq.description', 'Управление заявками на спецпредложения', 'Manage special offer requests', 'Īpašo piedāvājumu pieprasījumu pārvaldība'),
            linkText: tl('admin.dashboard.cards.rfq.open', 'Открыть RFQ панель', 'Open RFQ panel', 'Atvērt RFQ paneli'),
        },
        {
            id: 'barcodes',
            href: '/admin/client-barcodes',
            adminOnly: true,
            bg: 'bg-cyan-50 dark:bg-cyan-950/20',
            border: 'border-l-cyan-500',
            title: tl('admin.dashboard.cards.clientBarcodes.title', 'Карты клиентов', 'Client cards', 'Klientu kartes'),
            description: tl('admin.dashboard.cards.clientBarcodes.description', 'Выдача, редактирование и привязка карт клиентов', 'Issue, edit and bind client cards', 'Klientu karšu izsniegšana, rediģēšana un piesaiste'),
            linkText: tl('admin.dashboard.cards.clientBarcodes.open', 'Открыть карты клиентов', 'Open client cards', 'Atvērt klientu kartes'),
        },
        {
            id: 'invitations',
            href: '/admin/invitations',
            adminOnly: true,
            bg: 'bg-indigo-50 dark:bg-indigo-950/20',
            border: 'border-l-indigo-500',
            title: l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi'),
            description: l('Приглашения держателям карт и рассылка правил получения карты', 'Invitations for card holders and card-rules mailing', 'Ielūgumi karšu īpašniekiem un kartes noteikumu izsūtīšana'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'webhooks',
            href: '/account/integrations/webhooks',
            adminOnly: true,
            bg: 'bg-violet-50 dark:bg-violet-950/20',
            border: 'border-l-violet-500',
            title: 'B2B Webhooks',
            description: tl('admin.dashboard.cards.webhooks.description', 'Проверка endpoint и истории доставок', 'Check endpoints and delivery history', 'Galamērķu un piegāžu vēstures pārbaude'),
            linkText: tl('admin.dashboard.cards.webhooks.open', 'Открыть Webhooks', 'Open Webhooks', 'Atvērt Webhooks'),
        },
        {
            id: 'products',
            href: '/admin/products',
            adminOnly: true,
            bg: 'bg-emerald-50 dark:bg-emerald-950/20',
            border: 'border-l-emerald-500',
            title: tl('admin.dashboard.cards.products.title', 'Товары', 'Products', 'Produkti'),
            description: tl(
                'admin.dashboard.cards.products.description',
                'Редактирование цен и описаний, поиск по характеристикам',
                'Edit prices/descriptions and search by attributes',
                'Cenu un aprakstu rediģēšana, meklēšana pēc īpašībām'
            ),
            linkText: tl('admin.dashboard.cards.products.open', 'Открыть товары', 'Open products', 'Atvērt produktus'),
        },
        {
            id: 'blog',
            href: '/admin/blog',
            adminOnly: true,
            bg: 'bg-orange-50 dark:bg-orange-950/20',
            border: 'border-l-orange-500',
            title: tl('admin.dashboard.cards.blog.title', 'Блог', 'Blog', 'Blogs'),
            description: tl('admin.dashboard.cards.blog.description', 'Создание, редактирование и удаление статей', 'Create, edit, and delete articles', 'Rakstu izveide, rediģēšana un dzēšana'),
            linkText: tl('admin.dashboard.cards.blog.open', 'Открыть управление блогом', 'Open blog management', 'Atvērt bloga pārvaldību'),
        },
        {
            id: 'content',
            href: '/admin/content',
            adminOnly: true,
            bg: 'bg-amber-50 dark:bg-amber-950/20',
            border: 'border-l-amber-500',
            title: tl('admin.dashboard.cards.content.title', 'Контент сайта', 'Site content', 'Vietnes saturs'),
            description: tl('admin.dashboard.cards.content.description', 'Редактирование текстов и изображений без правки кода', 'Edit text and images without code changes', 'Tekstu un attēlu rediģēšana bez koda izmaiņām'),
            linkText: tl('admin.dashboard.cards.content.open', 'Открыть контент-панель', 'Open content panel', 'Atvērt satura paneli'),
        },
        {
            id: 'banners',
            href: '/admin/content/banners',
            adminOnly: true,
            bg: 'bg-yellow-50 dark:bg-yellow-950/20',
            border: 'border-l-yellow-500',
            title: l('Баннеры', 'Banners', 'Baneri'),
            description: l('Управление промо-баннерами главной страницы', 'Manage promo banners on the homepage', 'Sākumlapas reklāmas baneru pārvaldība'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'design',
            href: '/admin/design-system',
            adminOnly: true,
            bg: 'bg-slate-100 dark:bg-slate-800/40',
            border: 'border-l-slate-400',
            title: 'Design System',
            description: l('Визуальный справочник токенов, компонентов и паттернов проекта', 'Visual reference of tokens, components and patterns', 'Vizuāla projekta marķieru, komponentu un šablonu rokasgrāmata'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'reviews',
            href: '/admin/reviews',
            adminOnly: true,
            bg: 'bg-pink-50 dark:bg-pink-950/20',
            border: 'border-l-pink-500',
            title: tl('admin.dashboard.cards.reviews.title', 'Отзывы', 'Reviews', 'Atsauksmes'),
            description: tl('admin.dashboard.cards.reviews.description', 'Просмотр, скрытие и модерация пользовательских отзывов', 'View, hide and moderate user reviews', 'Lietotāju atsauksmju skatīšana, slēpšana un moderēšana'),
            linkText: tl('admin.dashboard.cards.reviews.open', 'Открыть модерацию отзывов', 'Open reviews moderation', 'Atvērt atsauksmju moderēšanu'),
        },
        {
            id: 'discounts',
            href: '/admin/marketing/discounts',
            adminOnly: true,
            bg: 'bg-red-50 dark:bg-red-950/20',
            border: 'border-l-red-500',
            title: l('Промокоды', 'Promo codes', 'Promokodi'),
            description: l('Управление промокодами: создание, редактирование, статистика использования', 'Manage promo codes: create, edit, usage stats', 'Promokodu pārvaldība: izveide, rediģēšana un izmantošanas statistika'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'campaigns',
            href: '/admin/marketing/campaigns',
            adminOnly: true,
            bg: 'bg-purple-50 dark:bg-purple-950/20',
            border: 'border-l-purple-500',
            title: l('Промо-кампании', 'Promo campaigns', 'Reklāmas kampaņas'),
            description: l('Создание и управление маркетинговыми кампаниями по категориям товаров', 'Create and manage marketing campaigns by product category', 'Mārketinga kampaņu izveide un pārvaldība pēc produktu kategorijām'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'promo-analytics',
            href: '/admin/marketing/analytics',
            adminOnly: true,
            bg: 'bg-rose-50 dark:bg-rose-950/20',
            border: 'border-l-rose-500',
            title: l('Аналитика промо', 'Promo analytics', 'Reklāmas analītika'),
            description: l('Статистика использования промокодов, конверсия и эффективность скидок', 'Promo code usage stats, conversion and discount effectiveness', 'Promokodu izmantošanas statistika, konversija un atlaižu efektivitāte'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'bonus',
            href: '/admin/bonus',
            adminOnly: true,
            bg: 'bg-green-50 dark:bg-green-950/20',
            border: 'border-l-green-500',
            title: t('admin.bonus.title'),
            description: tl('admin.dashboard.cards.bonus.description', 'Настройка начисления и списания бонусных баллов', 'Bonus points earn and spend settings', 'Bonusu punktu uzkrāšanas un izmantošanas iestatījumi'),
            linkText: tl('admin.dashboard.cards.bonus.open', 'Открыть бонусную программу', 'Open bonus program', 'Atvērt bonusu programmu'),
        },
        {
            id: 'breakdown',
            href: '/admin/sales/breakdown',
            adminOnly: true,
            bg: 'bg-sky-50 dark:bg-sky-950/20',
            border: 'border-l-sky-500',
            title: l('Аналитика: товары', 'Product analytics', 'Produktu analītika'),
            description: l('Топ-10 товаров, топ бренды, динамика выручки по категориям', 'Top products, top brands, revenue by category', 'Populārākie produkti un zīmoli, ieņēmumi pēc kategorijām'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'analytics',
            href: '/admin/analytics',
            adminOnly: true,
            bg: 'bg-violet-50 dark:bg-violet-950/20',
            border: 'border-l-violet-500',
            title: l('ABC / Когорты / SEO', 'ABC / Cohorts / SEO', 'ABC / Kohortas / SEO'),
            description: l('ABC-анализ товаров, когортный retention клиентов, SEO-пробелы каталога', 'Product ABC analysis, cohort retention, catalog SEO gaps', 'Produktu ABC analīze, kohortu noturēšana un kataloga SEO trūkumi'),
            linkText: l('Открыть', 'Open', 'Atvērt'),
        },
        {
            id: 'notifications-broadcast',
            href: '/admin/notifications/send',
            adminOnly: true,
            bg: 'bg-primary/5 dark:bg-primary/10',
            border: 'border-l-primary/60',
            title: l('Рассылка уведомлений', 'Notification Broadcast', 'Paziņojumu izsūtīšana'),
            description: l(
                'Отправка уведомлений выбранным пользователям в кабинет, email или оба канала',
                'Send notifications to selected users via in-cabinet, email, or both channels',
                'Nosūtiet paziņojumus izvēlētajiem lietotājiem kontā, e-pastā vai abos kanālos'
            ),
            linkText: l('Открыть рассылку', 'Open broadcast', 'Atvērt izsūtīšanu'),
        },
    ];
}

