'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconGrid, IconList } from '@/components/ui/icon-view';
import AdminGate from '@/components/admin/AdminGate';
import { useAdminLocale } from '@/lib/use-admin-locale';

type KnowledgeArticle = {
    icon: string;
    title: string;
    description: string;
    href: string;
    linkLabel: string;
};

const articles: KnowledgeArticle[] = [
    {
        icon: '📦',
        title: 'Управление каталогом',
        description:
            'Добавляйте товары, редактируйте карточки, цены и остатки, ищите по каталогу и переключайтесь между карточками и таблицей. В таблице цену и остаток можно изменить прямо в строке. Удалённые товары сначала попадают в архив, откуда их можно восстановить или удалить окончательно.',
        href: '/admin/products',
        linkLabel: 'Открыть каталог',
    },
    {
        icon: '🔍',
        title: 'Дубликаты товаров',
        description:
            'Автоматический поиск товаров с одинаковым названием или SKU — помогает навести порядок после нескольких импортов. Результаты сгруппированы, каждый дубликат открывается прямо в редакторе.',
        href: '/admin/products/duplicates',
        linkLabel: 'Найти дубликаты',
    },
    {
        icon: '🛒',
        title: 'Работа с заказами',
        description:
            'Ищите и фильтруйте заказы, открывайте состав и данные доставки, меняйте статус одного или нескольких заказов. Здесь же доступны печать, счёт, возврат, отмена и экспорт заказов или уникальных клиентов в CSV. Заказ по телефону можно оформить через кнопку «Создать заказ».',
        href: '/admin/orders',
        linkLabel: 'Открыть заказы',
    },
    {
        icon: '👤',
        title: 'Профиль клиента',
        description:
            'Из сегментов можно перейти в профиль покупателя и посмотреть контакты, историю заказов, возвраты, сумму покупок, средний чек и популярные товары. Отдельные разделы содержат список аккаунтов и общую историю клиентов.',
        href: '/admin/customers/segments',
        linkLabel: 'Сегменты клиентов',
    },
    {
        icon: '📊',
        title: 'Аналитика: ABC и когорты',
        description:
            'ABC-анализ: товары автоматически делятся на группы A (80% выручки), B и C — помогает понять что держать в запасе. Когортный анализ: retention клиентов по месяцу первой покупки. SEO-отчёт: товары без metaTitle, metaDescription или изображения.',
        href: '/admin/analytics',
        linkLabel: 'Открыть аналитику',
    },
    {
        icon: '📈',
        title: 'Аналитика продаж',
        description:
            'Выручка по дням, заказы по периодам, средний чек. Отдельный раздел: топ-10 товаров по выручке, топ бренды, динамика продаж по категориям в виде stacked bar chart. Переключение между выручкой и количеством.',
        href: '/admin/sales/analytics',
        linkLabel: 'Аналитика продаж',
    },
    {
        icon: '🏷️',
        title: 'Промокоды и скидки',
        description:
            'Создавайте и редактируйте купоны, задавайте размер скидки, минимальную сумму, срок действия и лимит использований. Перед публикацией проверьте условия и активность купона в списке.',
        href: '/admin/marketing/discounts',
        linkLabel: 'Открыть скидки',
    },
    {
        icon: '📧',
        title: 'Рассылка по сегментам',
        description:
            'Отправьте письмо нужной группе клиентов прямо из раздела сегментов. Переменные {first_name}, {last_name}, {email} подставляются персонально. Вкладка «Превью» покажет как письмо будет выглядеть до отправки.',
        href: '/admin/customers/segments',
        linkLabel: 'Открыть сегменты',
    },
    {
        icon: '⭐',
        title: 'Бонусная программа',
        description:
            'Настройка процента начисления бонусов с каждой покупки и максимального процента оплаты бонусами. Устанавливается минимальная сумма заказа для начисления. Программу можно включить или отключить.',
        href: '/admin/bonus',
        linkLabel: 'Открыть настройки',
    },
    {
        icon: '✍️',
        title: 'Управление блогом',
        description:
            'Создавайте и редактируйте статьи, заполняйте заголовок, анонс, содержимое, обложку и SEO-поля для русского, английского и латышского языков. Публикацию можно сохранить как черновик.',
        href: '/admin/blog',
        linkLabel: 'Открыть блог',
    },
    {
        icon: '🖼️',
        title: 'Медиа-библиотека',
        description:
            'Загрузка и управление изображениями. Bulk-выбор и массовое удаление. Информация о том, в скольких товарах используется каждый файл. Кнопка «Заменить файл» перезаписывает изображение с тем же путём — все ссылки обновляются автоматически.',
        href: '/admin/content/media',
        linkLabel: 'Открыть медиатеку',
    },
    {
        icon: '🤝',
        title: 'B2B заявки (RFQ)',
        description:
            'Обработка запросов на котировку от корпоративных клиентов. Укажите цену, условия и срок действия предложения. Каждое действие фиксируется в таймлайне заявки — видно когда создана, когда отправлена котировка, когда принята или отклонена.',
        href: '/admin/rfq',
        linkLabel: 'Открыть RFQ',
    },
    {
        icon: '📋',
        title: 'Импорт / Экспорт',
        description:
            'Экспортируйте текущий каталог в CSV, меняйте данные в таблице и загружайте файл обратно. Обязательный предпросмотр показывает для каждой строки действие: создать, обновить, пропустить или ошибка. Заказы и список уникальных клиентов экспортируются отдельно в разделе «Заказы».',
        href: '/admin/import',
        linkLabel: 'Открыть импорт',
    },
    {
        icon: '🔎',
        title: 'Глобальный поиск',
        description:
            'Нажмите Ctrl+K (или ⌘K) на любой странице админки, чтобы открыть быстрый поиск. Он ищет товары, заказы, клиентов и разделы админки; Enter открывает выбранный результат.',
        href: '/admin',
        linkLabel: 'На главную',
    },
    {
        icon: '🔐',
        title: 'Лог действий администраторов',
        description:
            'Фиксирует кто и когда изменил статус заказа, цену товара, создал промокод, поменял статус возврата. Для каждого события — значения «до» и «после». Экспорт в CSV. Находится в разделе Система.',
        href: '/admin/system/admin-log',
        linkLabel: 'Открыть лог',
    },
    {
        icon: '💾',
        title: 'Резервное копирование',
        description:
            'Скачивайте экспорт файловых настроек магазина (блог, контент сайта, баннеры, промокоды, настройки доставки) в JSON. Автоматическое восстановление из файла отключено — здесь можно только проверить состав выбранного файла; фактическое восстановление выполняется вручную в рамках техобслуживания. Заказы, пользователи, счета и товары из PostgreSQL сюда не входят.',
        href: '/admin/system/backup',
        linkLabel: 'Открыть Backup',
    },
    {
        icon: '🔔',
        title: 'Рассылка уведомлений',
        description:
            'Отправка уведомлений выбранным пользователям. Три канала: «В кабинете» (появляется при следующем входе), «Email» (на адрес из профиля), «Оба канала» сразу. Поиск получателей по имени или email — можно выбрать одного или сразу всех. Поддерживаются типы: info, success, warning, promo. Можно добавить ссылку — клиент попадёт прямо в нужный раздел.',
        href: '/admin/notifications/send',
        linkLabel: 'Открыть рассылку',
    },
    {
        icon: '📇',
        title: 'Карты клиентов',
        description:
            'Управление B2B компаниями: добавление, редактирование реквизитов, выдача клиентской карты с уникальным кодом. Клиент вводит код при регистрации → заявка попадает в раздел «Заявки на доступ» → администратор назначает роль и одобряет. Можно включить workflow обязательного одобрения заказов для компании. PDF карточки формируется и скачивается прямо в интерфейсе.',
        href: '/admin/client-barcodes',
        linkLabel: 'Открыть карты',
    },
    {
        icon: '⭐',
        title: 'Модерация отзывов',
        description:
            'Просмотр всех отзывов покупателей с фильтрацией по товару, рейтингу и статусу. Каждый отзыв можно скрыть (не отображается на сайте) или снова опубликовать. Скрытые отзывы не удаляются — их можно восстановить в любой момент. Статистика рейтингов обновляется автоматически.',
        href: '/admin/reviews',
        linkLabel: 'Открыть отзывы',
    },
    {
        icon: '🔄',
        title: 'Возвраты и отмены',
        description:
            'Обработка заявок на возврат от клиентов. Статусы: новая → в обработке → одобрена / отклонена. Каждое изменение статуса фиксируется с временной меткой. Можно добавить комментарий менеджера — клиент увидит его в своём кабинете. Фильтрация по дате, статусу и сумме.',
        href: '/admin/returns',
        linkLabel: 'Открыть возвраты',
    },
    {
        icon: '⚡',
        title: 'Алерты остатков',
        description:
            'Настройка порогов для уведомлений о низком остатке. Когда количество товара опускается до заданного значения — система создаёт алерт. На дашборде администратора сразу виден счётчик товаров требующих внимания. Помогает не допустить ситуации «товар в каталоге, но склад пуст».',
        href: '/admin/stock-alerts',
        linkLabel: 'Открыть алерты',
    },
    {
        icon: '💰',
        title: 'Массовое обновление цен',
        description:
            'Изменение цен сразу по категории, бренду или вручную выбранным товарам. Операции: увеличить/уменьшить на %, установить фиксированную цену, округлить до ближайшего значения. Перед применением — предпросмотр изменений. Незаменимо при сезонных переоценках или изменении курса валют.',
        href: '/admin/products/bulk-price',
        linkLabel: 'Открыть массовые цены',
    },
    {
        icon: '📣',
        title: 'Промо-кампании',
        description:
            'Создание маркетинговых кампаний с привязкой к категориям товаров. Задайте название, период действия и целевые категории. Кампании отображаются в аналитике промо — можно видеть какие из них приносят больше заказов. Используются совместно с промокодами для комплексных акций.',
        href: '/admin/marketing/campaigns',
        linkLabel: 'Открыть кампании',
    },
    {
        icon: '✉️',
        title: 'Email-шаблоны',
        description:
            'Редактируйте тему и HTML транзакционных писем. Доступные для выбранного шаблона переменные записываются в двойных фигурных скобках, например {{firstName}}; вкладка «Предпросмотр» подставляет тестовые значения перед сохранением.',
        href: '/admin/config/email-templates',
        linkLabel: 'Открыть шаблоны',
    },
    {
        icon: '📄',
        title: 'Страницы сайта',
        description:
            'Изменяйте зарегистрированные тексты и изображения сайта отдельно для RU, EN и LV. Поля сгруппированы по страницам; изменённое значение можно сбросить к базовому. Раздел редактирует только элементы, внесённые в реестр контента.',
        href: '/admin/content',
        linkLabel: 'Открыть страницы',
    },
    {
        icon: '🖼️',
        title: 'Баннеры',
        description:
            'Управление баннерами на главной странице: заголовок, подпись, изображение, ссылка, текст и стиль кнопки, цвета. Активность каждого баннера включается и выключается отдельно, порядок меняется кнопками «выше/ниже».',
        href: '/admin/content/banners',
        linkLabel: 'Открыть баннеры',
    },
    {
        icon: '🗂️',
        title: 'Категории и бренды',
        description:
            'Управляйте структурой категорий, их переводами и состоянием, а также карточками брендов. Перед удалением категории проверьте связанные товары; удалённые категории можно просмотреть в отдельном блоке.',
        href: '/admin/categories',
        linkLabel: 'Открыть категории',
    },
    {
        icon: '🚚',
        title: 'Доставка, локализация и цены B2B',
        description:
            'В конфигурации настраиваются способы доставки и оплаты, параметры локализации. Группы B2B-цен пока можно только создавать и редактировать здесь — на фактические цены в каталоге и чекауте они не влияют. После изменения доставки или оплаты проверьте результат на тестовом сценарии оформления заказа с подходящим аккаунтом.',
        href: '/admin/config/shipping',
        linkLabel: 'Открыть доставку и оплату',
    },
    {
        icon: '🧾',
        title: 'Системные логи',
        description:
            'Журнал действий показывает изменения, сделанные администраторами, а системные логи помогают разбирать ошибки и служебные события. Для проверки конкретного изменения используйте журнал действий, для технической диагностики — системные логи.',
        href: '/admin/system/logs',
        linkLabel: 'Открыть системные логи',
    },
];

type ArticleTranslation = Pick<KnowledgeArticle, 'title' | 'description' | 'linkLabel'>;

const articlesEn: ArticleTranslation[] = [
    [
        'Catalog management',
        'Add and edit products, prices, inventory, images, specifications, and SEO. Deleted products first move to the archive, where they can be restored or permanently removed.',
        'Open catalog',
    ],
    [
        'Duplicate products',
        'Find products with matching names or SKUs after imports. Results are grouped and each duplicate opens directly in the editor.',
        'Find duplicates',
    ],
    [
        'Working with orders',
        'Search and filter orders, review delivery details, change statuses, print documents, issue refunds, and export orders or customers to CSV.',
        'Open orders',
    ],
    [
        'Customer profile',
        'Review customer contacts, order and return history, total spending, average order value, and popular products.',
        'Customer segments',
    ],
    [
        'Analytics: ABC and cohorts',
        'Use ABC analysis to identify key revenue products, cohort analysis to track retention, and the SEO report to find incomplete product cards.',
        'Open analytics',
    ],
    [
        'Sales analytics',
        'Track daily revenue, orders, average order value, top products and brands, and category sales trends.',
        'Open sales analytics',
    ],
    [
        'Promo codes and discounts',
        'Create coupons and configure the discount, minimum order, expiry date, usage limit, and active status.',
        'Open discounts',
    ],
    [
        'Segment campaigns',
        'Email a selected customer segment with personalized variables and preview the message before sending.',
        'Open segments',
    ],
    [
        'Bonus program',
        'Configure the bonus earning rate, maximum bonus payment share, and minimum eligible order amount.',
        'Open settings',
    ],
    [
        'Blog management',
        'Create multilingual articles with titles, summaries, content, cover images, SEO fields, and draft publishing.',
        'Open blog',
    ],
    [
        'Media library',
        'Upload, replace, select, and delete images in bulk, and see which products use each file.',
        'Open media library',
    ],
    [
        'B2B requests (RFQ)',
        'Process quote requests, enter prices, terms and expiry dates, and follow every status change in the request timeline.',
        'Open RFQ',
    ],
    [
        'Import / Export',
        'Export the catalog to CSV, edit it, then preview every create, update, skip, or error action before importing.',
        'Open import',
    ],
    [
        'Global search',
        'Press Ctrl+K or ⌘K anywhere in admin to quickly find products, orders, customers, and sections.',
        'Go to dashboard',
    ],
    [
        'Administrator activity log',
        'See who changed an order, product, coupon, or return, including the values before and after each action.',
        'Open activity log',
    ],
    [
        'Backup and restore',
        'Download a JSON export of file-based store settings (blog, site content, banners, promo codes, delivery settings). Automatic restore from file is disabled — you can only inspect the selected file’s contents here; restoring is done manually during maintenance. Orders, users, invoices, and products in PostgreSQL are not included.',
        'Open backup',
    ],
    [
        'Notification campaign',
        'Send in-app or email notifications to one or many users, with a type and optional destination link.',
        'Open notifications',
    ],
    [
        'Customer cards',
        'Manage B2B companies, registration codes, access requests, roles, order approvals, and printable customer cards.',
        'Open customer cards',
    ],
    [
        'Review moderation',
        'Filter customer reviews, hide or republish them, and monitor rating statistics without deleting review history.',
        'Open reviews',
    ],
    [
        'Returns and cancellations',
        'Process return requests, update their status, add a manager note, and filter by date, status, or amount.',
        'Open returns',
    ],
    [
        'Inventory alerts',
        'Set low-stock thresholds and monitor products that require replenishment from the admin dashboard.',
        'Open alerts',
    ],
    [
        'Bulk price update',
        'Change prices by category, brand, or selection using percentages or fixed values, with a preview before applying.',
        'Open bulk pricing',
    ],
    [
        'Promotional campaigns',
        'Create dated campaigns for product categories and compare their order performance in promotional analytics.',
        'Open campaigns',
    ],
    [
        'Email templates',
        'Edit transactional email subjects and HTML, use supported variables, and preview test values before saving.',
        'Open templates',
    ],
    [
        'Website pages',
        'Edit registered website text and images separately for RU, EN, and LV, or reset a value to its default.',
        'Open pages',
    ],
    [
        'Banners',
        'Manage homepage banner content, links, buttons, colors, visibility, and display order.',
        'Open banners',
    ],
    [
        'Categories and brands',
        'Manage category structure, translations, status, and brand cards. Check linked products before deleting a category.',
        'Open categories',
    ],
    [
        'Shipping, localization, and B2B prices',
        'Configure shipping and payment methods and localization settings here. B2B price groups can currently only be created and edited on this screen — they do not yet affect actual catalog or checkout prices. After changing shipping or payment settings, verify the result with a test checkout on a suitable account.',
        'Open shipping and payment',
    ],
    [
        'System logs',
        'Use the activity log for administrator changes and system logs for errors and technical diagnostics.',
        'Open system logs',
    ],
].map(([title, description, linkLabel]) => ({ title, description, linkLabel }));

const articlesLv: ArticleTranslation[] = [
    [
        'Kataloga pārvaldība',
        'Pievienojiet un rediģējiet produktus, cenas, krājumus, attēlus, īpašības un SEO. Dzēstos produktus var atjaunot no arhīva.',
        'Atvērt katalogu',
    ],
    [
        'Produktu dublikāti',
        'Atrodiet produktus ar vienādu nosaukumu vai SKU pēc importa un atveriet katru dublikātu redaktorā.',
        'Atrast dublikātus',
    ],
    [
        'Darbs ar pasūtījumiem',
        'Meklējiet un filtrējiet pasūtījumus, pārbaudiet piegādi, mainiet statusus, drukājiet dokumentus un eksportējiet CSV.',
        'Atvērt pasūtījumus',
    ],
    [
        'Klienta profils',
        'Skatiet klienta kontaktus, pasūtījumu un atgriešanu vēsturi, tēriņus, vidējo pirkumu un populārākos produktus.',
        'Klientu segmenti',
    ],
    [
        'Analītika: ABC un kohortas',
        'ABC analīze parāda svarīgākos produktus, kohortas — klientu noturēšanu, bet SEO pārskats — nepilnīgas produktu kartītes.',
        'Atvērt analītiku',
    ],
    [
        'Pārdošanas analītika',
        'Sekojiet ieņēmumiem, pasūtījumiem, vidējai pirkuma summai, populārākajiem produktiem, zīmoliem un kategorijām.',
        'Atvērt pārdošanas analītiku',
    ],
    [
        'Promokodi un atlaides',
        'Veidojiet kuponus un norādiet atlaidi, minimālo summu, derīguma termiņu, izmantošanas limitu un statusu.',
        'Atvērt atlaides',
    ],
    [
        'Segmentu kampaņas',
        'Nosūtiet personalizētu e-pastu izvēlētam klientu segmentam un pirms nosūtīšanas apskatiet priekšskatījumu.',
        'Atvērt segmentus',
    ],
    [
        'Bonusu programma',
        'Iestatiet bonusu uzkrāšanas likmi, maksimālo apmaksas daļu un minimālo pasūtījuma summu.',
        'Atvērt iestatījumus',
    ],
    [
        'Bloga pārvaldība',
        'Veidojiet daudzvalodu rakstus ar saturu, vāka attēlu, SEO laukiem un melnraksta režīmu.',
        'Atvērt blogu',
    ],
    [
        'Mediju bibliotēka',
        'Augšupielādējiet, aizstājiet, atlasiet un dzēsiet attēlus un pārbaudiet, kuros produktos tie tiek izmantoti.',
        'Atvērt mediju bibliotēku',
    ],
    [
        'B2B pieprasījumi (RFQ)',
        'Apstrādājiet cenu pieprasījumus, norādiet cenu, nosacījumus un termiņu un sekojiet statusu vēsturei.',
        'Atvērt RFQ',
    ],
    [
        'Imports / Eksports',
        'Eksportējiet katalogu CSV, rediģējiet to un pirms importa pārbaudiet katras rindas paredzēto darbību.',
        'Atvērt importu',
    ],
    [
        'Globālā meklēšana',
        'Nospiediet Ctrl+K vai ⌘K jebkurā administrēšanas lapā, lai atrastu produktus, pasūtījumus, klientus un sadaļas.',
        'Uz sākumlapu',
    ],
    [
        'Administratoru darbību žurnāls',
        'Skatiet, kurš mainīja pasūtījumu, produktu, kuponu vai atgriešanu, tostarp vērtības pirms un pēc darbības.',
        'Atvērt darbību žurnālu',
    ],
    [
        'Rezerves kopēšana',
        'Lejupielādējiet veikala failu iestatījumu (blogs, vietnes saturs, baneri, promokodi, piegādes iestatījumi) JSON eksportu. Automātiskā atjaunošana no faila ir atspējota — šeit var tikai pārbaudīt izvēlētā faila saturu; atjaunošanu veic manuāli apkopes laikā. Pasūtījumi, lietotāji, rēķini un produkti PostgreSQL datubāzē šeit netiek iekļauti.',
        'Atvērt rezerves kopijas',
    ],
    [
        'Paziņojumu kampaņa',
        'Nosūtiet paziņojumus lietotnē vai e-pastā vienam vai vairākiem lietotājiem un pievienojiet mērķa saiti.',
        'Atvērt paziņojumus',
    ],
    [
        'Klientu kartes',
        'Pārvaldiet B2B uzņēmumus, reģistrācijas kodus, piekļuves pieprasījumus, lomas, pasūtījumu apstiprināšanu un klientu kartes.',
        'Atvērt klientu kartes',
    ],
    [
        'Atsauksmju moderēšana',
        'Filtrējiet klientu atsauksmes, paslēpiet vai publicējiet tās un sekojiet vērtējumu statistikai.',
        'Atvērt atsauksmes',
    ],
    [
        'Atgriešana un atcelšana',
        'Apstrādājiet atgriešanas pieprasījumus, mainiet statusu, pievienojiet vadītāja piezīmi un izmantojiet filtrus.',
        'Atvērt atgriešanu',
    ],
    [
        'Krājumu brīdinājumi',
        'Iestatiet zema krājuma sliekšņus un administrēšanas panelī sekojiet produktiem, kas jāpapildina.',
        'Atvērt brīdinājumus',
    ],
    [
        'Cenu masveida atjaunināšana',
        'Mainiet cenas pēc kategorijas, zīmola vai atlases ar procentiem vai fiksētu vērtību un pirms tam apskatiet priekšskatījumu.',
        'Atvērt cenu redaktoru',
    ],
    [
        'Reklāmas kampaņas',
        'Veidojiet kampaņas produktu kategorijām un salīdziniet to pasūtījumu rezultātus reklāmas analītikā.',
        'Atvērt kampaņas',
    ],
    [
        'E-pasta veidnes',
        'Rediģējiet transakciju vēstuļu tēmas un HTML, izmantojiet mainīgos un pirms saglabāšanas atveriet priekšskatījumu.',
        'Atvērt veidnes',
    ],
    [
        'Vietnes lapas',
        'Rediģējiet reģistrēto vietnes tekstu un attēlus atsevišķi RU, EN un LV valodai vai atiestatiet sākotnējo vērtību.',
        'Atvērt lapas',
    ],
    [
        'Baneri',
        'Pārvaldiet sākumlapas baneru saturu, saites, pogas, krāsas, redzamību un secību.',
        'Atvērt banerus',
    ],
    [
        'Kategorijas un zīmoli',
        'Pārvaldiet kategoriju struktūru, tulkojumus, statusu un zīmolu kartītes. Pirms dzēšanas pārbaudiet saistītos produktus.',
        'Atvērt kategorijas',
    ],
    [
        'Piegāde, lokalizācija un B2B cenas',
        'Šeit konfigurējiet piegādes un apmaksas veidus, kā arī lokalizācijas iestatījumus. B2B cenu grupas pagaidām var tikai izveidot un rediģēt šajā ekrānā — tās vēl neietekmē faktiskās cenas katalogā vai pasūtījuma noformēšanā. Pēc piegādes vai apmaksas iestatījumu maiņas pārbaudiet rezultātu ar testa pasūtījumu piemērotā kontā.',
        'Atvērt piegādi un apmaksu',
    ],
    [
        'Sistēmas žurnāli',
        'Administratoru izmaiņām izmantojiet darbību žurnālu, bet kļūdām un tehniskai diagnostikai — sistēmas žurnālus.',
        'Atvērt sistēmas žurnālus',
    ],
].map(([title, description, linkLabel]) => ({ title, description, linkLabel }));

const STORAGE_KEY = 'admin-knowledge-view';

export default function AdminKnowledgePage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const localizedArticles = articles.map((article, index) => ({
        ...article,
        ...(language === 'en' ? articlesEn[index] : language === 'lv' ? articlesLv[index] : null),
    }));
    const [view, setView] = useState<'grid' | 'list'>(() => {
        if (typeof window === 'undefined') return 'grid';
        return (localStorage.getItem(STORAGE_KEY) as 'grid' | 'list') ?? 'grid';
    });

    const switchView = (v: 'grid' | 'list') => {
        setView(v);
        try {
            localStorage.setItem(STORAGE_KEY, v);
        } catch {}
    };

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l('База знаний', 'Knowledge base', 'Zināšanu bāze')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {l(
                                'Руководство по работе с административной панелью',
                                'Guide to using the administration panel',
                                'Administrēšanas paneļa lietošanas rokasgrāmata'
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground font-medium">
                            {l('Выбор вида:', 'View:', 'Skats:')}
                        </span>
                        <Button
                            size="sm"
                            variant={view === 'grid' ? 'default' : 'outline'}
                            onClick={() => switchView('grid')}
                        >
                            <IconGrid className="mr-2" />
                            {l('Карточки', 'Cards', 'Kartītes')}
                        </Button>
                        <Button
                            size="sm"
                            variant={view === 'list' ? 'default' : 'outline'}
                            onClick={() => switchView('list')}
                        >
                            <IconList className="mr-2" />
                            {l('Список', 'List', 'Saraksts')}
                        </Button>
                        <Link href="/admin">
                            <Button variant="outline">
                                {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrēšanu')}
                            </Button>
                        </Link>
                    </div>
                </div>

                {view === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {localizedArticles.map((article) => (
                            <div
                                key={article.href + article.title}
                                className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-2xl leading-none">{article.icon}</span>
                                    <h2 className="text-base font-semibold text-foreground">
                                        {article.title}
                                    </h2>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                                    {article.description}
                                </p>
                                <Link href={article.href} className="mt-auto">
                                    <span className="text-sm font-medium text-primary group-hover:underline">
                                        {article.linkLabel} →
                                    </span>
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {localizedArticles.map((article) => (
                            <Link
                                key={article.href + article.title}
                                href={article.href}
                                className="group flex items-center gap-4 px-5 py-4 bg-muted rounded-xl border border-border shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                            >
                                <span className="text-xl leading-none flex-shrink-0">
                                    {article.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-sm font-semibold text-foreground mb-0.5 group-hover:text-primary dark:group-hover:text-primary/80 transition-colors">
                                        {article.title}
                                    </h2>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {article.description}
                                    </p>
                                </div>
                                <svg
                                    className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-primary/80 transition-colors"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                >
                                    <path
                                        d="M6 3l5 5-5 5"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </AdminGate>
    );
}
