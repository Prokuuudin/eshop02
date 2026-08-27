'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import AdminGate from '@/components/admin/AdminGate';
import { useAdminLocale } from '@/lib/use-admin-locale';

type OnboardingStep = {
    id: number;
    group: 'day1' | 'week1' | 'month1';
    icon: string;
    text: string;
    href?: string;
    linkLabel?: string;
};

const steps: OnboardingStep[] = [
    // Первый день
    {
        id: 1,
        group: 'day1',
        icon: '🔑',
        text: 'Проверьте данные своего профиля и убедитесь, что знаете, как безопасно выйти из аккаунта',
        href: '/account/profile',
        linkLabel: 'Профиль',
    },
    {
        id: 2,
        group: 'day1',
        icon: '🔍',
        text: 'Попробуйте глобальный поиск: нажмите Ctrl+K (или ⌘K) и введите название любого товара или заказа',
        href: '/admin',
        linkLabel: 'Главная',
    },
    {
        id: 3,
        group: 'day1',
        icon: '📦',
        text: 'Ознакомьтесь с каталогом: найдите товар, переключитесь на табличный вид и откройте его карточку. Изменения вносите только в согласованный тестовый товар',
        href: '/admin/products',
        linkLabel: 'Каталог',
    },
    {
        id: 4,
        group: 'day1',
        icon: '🛒',
        text: 'Изучите фильтры, состав и действия заказа. Статус или заметку меняйте только у специально созданного тестового заказа',
        href: '/admin/orders',
        linkLabel: 'Заказы',
    },

    // Первая неделя
    {
        id: 5,
        group: 'week1',
        icon: '🏷️',
        text: 'Изучите форму промокода и список действующих условий. Тестовый купон создавайте только с согласованным кодом и ограниченным сроком',
        href: '/admin/marketing/discounts',
        linkLabel: 'Промокоды',
    },
    {
        id: 6,
        group: 'week1',
        icon: '🎨',
        text: 'Откройте баннеры и промо-блоки, изучите поля и предпросмотр. Не публикуйте изменения без согласования',
        href: '/admin/content/banners',
        linkLabel: 'Баннеры',
    },
    {
        id: 7,
        group: 'week1',
        icon: '🖼️',
        text: 'Изучите медиатеку: поиск, фильтры, сведения об использовании файла и действие замены. Для практики используйте отдельное тестовое изображение',
        href: '/admin/content/media',
        linkLabel: 'Медиатека',
    },
    {
        id: 8,
        group: 'week1',
        icon: '📊',
        text: 'Откройте аналитику каталога и изучите три вкладки: ABC-анализ товаров, когортный retention, SEO-отчёт',
        href: '/admin/analytics',
        linkLabel: 'Аналитика каталога',
    },
    {
        id: 9,
        group: 'week1',
        icon: '✍️',
        text: 'Откройте редактор блога и изучите языковые, SEO-поля и управление публикацией. Если нужен тест, оставьте статью черновиком',
        href: '/admin/blog',
        linkLabel: 'Блог',
    },
    {
        id: 16,
        group: 'week1',
        icon: '📄',
        text: 'Откройте «Страницы сайта», изучите зарегистрированные тексты и изображения для RU, EN и LV и действие сброса к базовому значению',
        href: '/admin/content',
        linkLabel: 'Страницы',
    },
    {
        id: 17,
        group: 'week1',
        icon: '✉️',
        text: 'Просмотрите email-шаблоны: откройте шаблон подтверждения заказа и проверьте во вкладке предпросмотра подстановку переменных {{...}}',
        href: '/admin/config/email-templates',
        linkLabel: 'Email-шаблоны',
    },
    {
        id: 18,
        group: 'week1',
        icon: '🔔',
        text: 'Изучите выбор получателей и каналов уведомлений. Тестовое уведомление отправляйте только себе через канал «В кабинете»',
        href: '/admin/notifications/send',
        linkLabel: 'Рассылка',
    },

    // Первый месяц
    {
        id: 10,
        group: 'month1',
        icon: '✅',
        text: 'Обработайте реальные заказы по принятому регламенту: проверяйте оплату и доставку перед сменой статуса, используйте массовые действия только для однородной выборки',
    },
    {
        id: 11,
        group: 'month1',
        icon: '👤',
        text: 'Откройте профиль клиента из раздела сегментов: изучите его историю заказов, возвраты и топ товаров',
        href: '/admin/customers/segments',
        linkLabel: 'Сегменты',
    },
    {
        id: 12,
        group: 'month1',
        icon: '📋',
        text: 'Скачайте экспорт каталога, подготовьте учебный CSV и изучите предпросмотр create/update/skip/error. Не запускайте импорт в рабочую базу без проверки ответственного сотрудника',
        href: '/admin/import',
        linkLabel: 'Импорт',
    },
    {
        id: 13,
        group: 'month1',
        icon: '💾',
        text: 'Создайте резервную копию данных магазина и убедитесь, что файл скачивается корректно',
        href: '/admin/system/backup',
        linkLabel: 'Backup',
    },
    {
        id: 14,
        group: 'month1',
        icon: '🤝',
        text: 'Изучите список и таймлайн B2B-заявок. Предложение клиенту отправляйте только после согласования цены, условий и срока действия',
        href: '/admin/rfq',
        linkLabel: 'RFQ',
    },
    {
        id: 15,
        group: 'month1',
        icon: '🔐',
        text: 'Загляните в Лог действий администраторов — убедитесь что ваши действия за эти недели там отражены',
        href: '/admin/system/admin-log',
        linkLabel: 'Лог действий',
    },
    {
        id: 19,
        group: 'month1',
        icon: '📇',
        text: 'Изучите компании, карты и заявки на доступ. Тестовую компанию создавайте только по согласованию, чтобы не смешивать её с рабочими данными',
        href: '/admin/client-barcodes',
        linkLabel: 'Карты клиентов',
    },
    {
        id: 20,
        group: 'month1',
        icon: '🌟',
        text: 'Откройте отзывы и изучите фильтры и статусы модерации. Не скрывайте опубликованный отзыв без причины и принятого решения',
        href: '/admin/reviews',
        linkLabel: 'Отзывы',
    },
    {
        id: 21,
        group: 'month1',
        icon: '🎁',
        text: 'Изучите настройки бонусной программы и правила начисления и списания. Меняйте рабочие значения только после согласования и проверки сценария',
        href: '/admin/bonus',
        linkLabel: 'Бонусы',
    },
    {
        id: 22,
        group: 'week1',
        icon: '📉',
        text: 'Откройте алерты низкого остатка: настройте порог и включите фильтр «Скрыть неподтверждённые ERP», если остаток вызывает сомнение',
        href: '/admin/stock-alerts',
        linkLabel: 'Остатки',
    },
    {
        id: 23,
        group: 'month1',
        icon: '↩️',
        text: 'Обработайте возврат или отмену по регламенту: проверьте причину и статус заказа перед решением. Реальное решение принимайте только по согласованному сценарию',
        href: '/admin/returns',
        linkLabel: 'Возвраты',
    },
    {
        id: 24,
        group: 'month1',
        icon: '💬',
        text: 'Откройте запросы покупателей и изучите фильтры «без ответа / отвечено». Реальному клиенту отвечайте только после проверки регламента ответа',
        href: '/admin/contact-messages',
        linkLabel: 'Запросы',
    },
    {
        id: 25,
        group: 'month1',
        icon: '📩',
        text: 'Изучите приглашения клиентов: как формируется и отправляется письмо с картой доступа. Реальное приглашение отправляйте только по согласованному списку',
        href: '/admin/invitations',
        linkLabel: 'Приглашения',
    },
];

type StepTranslation = Pick<OnboardingStep, 'text' | 'linkLabel'>;

function toStepTranslations(items: Array<[text: string, linkLabel?: string]>): StepTranslation[] {
    return items.map(([text, linkLabel]) => ({ text, linkLabel }));
}

const stepsEn = toStepTranslations([
    ['Check your profile details and make sure you know how to sign out securely', 'Profile'],
    [
        'Try global search: press Ctrl+K (or ⌘K) and enter any product name or order number',
        'Dashboard',
    ],
    [
        'Explore the catalog: find a product, switch to table view, and open its card. Make changes only to an approved test product',
        'Catalog',
    ],
    [
        'Review order filters, contents, and actions. Change the status or note only on a dedicated test order',
        'Orders',
    ],
    [
        'Review the promo-code form and active conditions. Create a test coupon only with an approved code and short expiry date',
        'Promo codes',
    ],
    [
        'Open banners and promotional blocks and review their fields and preview. Do not publish changes without approval',
        'Banners',
    ],
    [
        'Explore media search, filters, usage details, and file replacement. Use a separate test image for practice',
        'Media library',
    ],
    [
        'Open catalog analytics and review product ABC analysis, cohort retention, and the SEO report',
        'Catalog analytics',
    ],
    [
        'Open the blog editor and review language fields, SEO, and publishing controls. Keep test articles as drafts',
        'Blog',
    ],
    [
        'Open Website pages and review registered text and images for RU, EN, and LV and the reset-to-default action',
        'Pages',
    ],
    [
        'Review email templates: open the order confirmation template and verify {{...}} variable substitution in preview',
        'Email templates',
    ],
    [
        'Review notification recipients and channels. Send test notifications only to yourself through the in-app channel',
        'Notifications',
    ],
    [
        'Process real orders according to procedure: verify payment and delivery before changing status and use bulk actions only for matching orders',
        undefined,
    ],
    [
        'Open a customer profile from segments and review their orders, returns, and top products',
        'Segments',
    ],
    [
        'Export the catalog, prepare a training CSV, and review create/update/skip/error actions. Never import into production without approval',
        'Import',
    ],
    ['Create a store-data backup and verify that the file downloads correctly', 'Backup'],
    [
        'Review the list and timeline of B2B requests. Send an offer only after its price, terms, and expiry are approved',
        'RFQ',
    ],
    [
        'Open the administrator activity log and confirm that your actions from recent weeks appear there',
        'Activity log',
    ],
    [
        'Review companies, customer cards, and access requests. Create a test company only with approval',
        'Customer cards',
    ],
    [
        'Open reviews and explore moderation filters and statuses. Do not hide a published review without an approved reason',
        'Reviews',
    ],
    [
        'Review bonus-program earning and spending rules. Change production values only after approval and scenario testing',
        'Bonuses',
    ],
    [
        'Open low-stock alerts: set a threshold and enable the "Hide ERP-unconfirmed" filter when a stock figure looks unreliable',
        'Stock alerts',
    ],
    [
        'Process a return or cancellation per procedure: check the reason and order status before deciding. Only act on real cases per an approved scenario',
        'Returns',
    ],
    [
        'Open customer requests and review the "unanswered / answered" filters. Reply to a real customer only after checking the response procedure',
        'Requests',
    ],
    [
        'Review client invitations: how the access-card email is generated and sent. Send a real invitation only from an approved list',
        'Invitations',
    ],
]);

const stepsLv = toStepTranslations([
    [
        'Pārbaudiet sava profila datus un pārliecinieties, ka protat droši izrakstīties no konta',
        'Profils',
    ],
    [
        'Izmēģiniet globālo meklēšanu: nospiediet Ctrl+K (vai ⌘K) un ievadiet produkta nosaukumu vai pasūtījuma numuru',
        'Sākumlapa',
    ],
    [
        'Iepazīstiet katalogu: atrodiet produktu, pārslēdzieties uz tabulas skatu un atveriet kartīti. Mainiet tikai saskaņotu testa produktu',
        'Katalogs',
    ],
    [
        'Izpētiet pasūtījumu filtrus, saturu un darbības. Statusu vai piezīmi mainiet tikai īpaši izveidotam testa pasūtījumam',
        'Pasūtījumi',
    ],
    [
        'Izpētiet promokoda formu un aktīvos nosacījumus. Testa kuponam izmantojiet tikai saskaņotu kodu un īsu termiņu',
        'Promokodi',
    ],
    [
        'Atveriet banerus un reklāmas blokus un izpētiet laukus un priekšskatījumu. Nepublicējiet izmaiņas bez saskaņošanas',
        'Baneri',
    ],
    [
        'Izpētiet mediju meklēšanu, filtrus, faila izmantošanu un aizstāšanu. Mācībām izmantojiet atsevišķu testa attēlu',
        'Mediju bibliotēka',
    ],
    [
        'Atveriet kataloga analītiku un izpētiet produktu ABC analīzi, kohortu noturēšanu un SEO pārskatu',
        'Kataloga analītika',
    ],
    [
        'Atveriet bloga redaktoru un izpētiet valodu un SEO laukus un publicēšanu. Testa rakstu saglabājiet kā melnrakstu',
        'Blogs',
    ],
    [
        'Atveriet Vietnes lapas un izpētiet RU, EN un LV tekstus, attēlus un atiestatīšanu uz sākotnējo vērtību',
        'Lapas',
    ],
    [
        'Izpētiet e-pasta veidnes: atveriet pasūtījuma apstiprinājumu un priekšskatījumā pārbaudiet {{...}} mainīgos',
        'E-pasta veidnes',
    ],
    [
        'Izpētiet paziņojumu saņēmējus un kanālus. Testa paziņojumu sūtiet tikai sev lietotnes kanālā',
        'Paziņojumi',
    ],
    [
        'Apstrādājiet pasūtījumus pēc noteiktās kārtības: pirms statusa maiņas pārbaudiet apmaksu un piegādi un grupveida darbības lietojiet tikai vienādai atlasei',
        undefined,
    ],
    [
        'Atveriet klienta profilu no segmentiem un izpētiet pasūtījumus, atgriešanas un populārākos produktus',
        'Segmenti',
    ],
    [
        'Eksportējiet katalogu, sagatavojiet mācību CSV un pārbaudiet create/update/skip/error darbības. Neimportējiet darba vidē bez saskaņošanas',
        'Imports',
    ],
    [
        'Izveidojiet veikala datu rezerves kopiju un pārliecinieties, ka fails tiek lejupielādēts pareizi',
        'Rezerves kopija',
    ],
    [
        'Izpētiet B2B pieprasījumu sarakstu un laika līniju. Piedāvājumu sūtiet tikai pēc cenas, nosacījumu un termiņa saskaņošanas',
        'RFQ',
    ],
    [
        'Atveriet administratoru darbību žurnālu un pārliecinieties, ka tajā ir redzamas jūsu pēdējo nedēļu darbības',
        'Darbību žurnāls',
    ],
    [
        'Izpētiet uzņēmumus, klientu kartes un piekļuves pieprasījumus. Testa uzņēmumu veidojiet tikai pēc saskaņošanas',
        'Klientu kartes',
    ],
    [
        'Atveriet atsauksmes un izpētiet moderēšanas filtrus un statusus. Neslēpiet publicētu atsauksmi bez pamatota lēmuma',
        'Atsauksmes',
    ],
    [
        'Izpētiet bonusu programmas uzkrāšanas un izmantošanas noteikumus. Darba vērtības mainiet tikai pēc saskaņošanas un pārbaudes',
        'Bonusi',
    ],
    [
        'Atveriet zema atlikuma brīdinājumus: iestatiet slieksni un ieslēdziet filtru "Slēpt ERP neapstiprinātos", ja atlikums šķiet neuzticams',
        'Atlikumi',
    ],
    [
        'Apstrādājiet atgriešanu vai atcelšanu pēc kārtības: pirms lēmuma pārbaudiet iemeslu un pasūtījuma statusu. Reālus lēmumus pieņemiet tikai pēc saskaņota scenārija',
        'Atgriešana',
    ],
    [
        'Atveriet klientu pieprasījumus un izpētiet filtrus "bez atbildes / atbildēts". Reālam klientam atbildiet tikai pēc atbildes kārtības pārbaudes',
        'Pieprasījumi',
    ],
    [
        'Izpētiet klientu ielūgumus: kā tiek izveidota un nosūtīta piekļuves kartes vēstule. Reālu ielūgumu sūtiet tikai pēc saskaņota saraksta',
        'Ielūgumi',
    ],
]);

const STORAGE_KEY = 'admin-onboarding-checked';

export default function AdminOnboardingPage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const localizedSteps = steps.map((step, index) => ({
        ...step,
        ...(language === 'en' ? stepsEn[index] : language === 'lv' ? stepsLv[index] : null),
    }));
    const groupLabels: Record<OnboardingStep['group'], string> = {
        day1: l('Первый день', 'First day', 'Pirmā diena'),
        week1: l('Первая неделя', 'First week', 'Pirmā nedēļa'),
        month1: l('Первый месяц', 'First month', 'Pirmais mēnesis'),
    };
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as number[];
                    if (Array.isArray(parsed)) setChecked(new Set(parsed));
                }
            } catch {
                /* ignore */
            }
            setLoaded(true);
        });
    }, []);

    const toggle = (id: number) => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const reset = () => {
        setChecked(new Set());
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    };

    const total = localizedSteps.length;
    const done = checked.size;
    const allDone = done === total;

    const groups: OnboardingStep['group'][] = ['day1', 'week1', 'month1'];

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l(
                                'Онбординг сотрудника',
                                'Employee onboarding',
                                'Darbinieka ievadīšana darbā'
                            )}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {l(
                                'Чеклист для знакомства с системой — отмечайте шаги по мере выполнения',
                                'A checklist for learning the system — mark steps as you complete them',
                                'Sistēmas iepazīšanas kontrolsaraksts — atzīmējiet pabeigtos soļus'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrēšanu')}
                        </Button>
                    </Link>
                </div>

                {/* Progress */}
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">
                            {l('Прогресс', 'Progress', 'Progress')}: {done} {l('из', 'of', 'no')}{' '}
                            {total}
                        </span>
                        <Button variant="outline" size="sm" onClick={reset}>
                            {l('Сбросить прогресс', 'Reset progress', 'Atiestatīt progresu')}
                        </Button>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-3 rounded-full transition-all duration-300"
                            style={{
                                width: `${Math.round((done / total) * 100)}%`,
                                background: allDone ? '#16a34a' : '#6366f1',
                            }}
                        />
                    </div>
                    {loaded && allDone && (
                        <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 font-medium">
                            {l(
                                'Отличная работа! Вы прошли все шаги онбординга. Добро пожаловать в команду!',
                                'Great work! You completed every onboarding step. Welcome to the team!',
                                'Lielisks darbs! Jūs pabeidzāt visus ievadīšanas soļus. Laipni lūdzam komandā!'
                            )}
                        </div>
                    )}
                </div>

                {/* Steps */}
                {groups.map((group) => (
                    <div
                        key={group}
                        className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
                    >
                        <div className="px-5 py-3 border-b border-border bg-muted/50">
                            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                {groupLabels[group]}
                            </h2>
                        </div>
                        <ul className="divide-y divide-border">
                            {localizedSteps
                                .filter((s) => s.group === group)
                                .map((step) => {
                                    const isDone = checked.has(step.id);
                                    return (
                                        <li
                                            key={step.id}
                                            className="flex items-start gap-4 px-5 py-4"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggle(step.id)}
                                                aria-label={
                                                    isDone
                                                        ? l(
                                                              'Снять отметку',
                                                              'Mark as incomplete',
                                                              'Atzīmēt kā nepabeigtu'
                                                          )
                                                        : l(
                                                              'Отметить выполненным',
                                                              'Mark as complete',
                                                              'Atzīmēt kā pabeigtu'
                                                          )
                                                }
                                                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    isDone
                                                        ? 'bg-green-500 border-green-500 text-white'
                                                        : 'border-gray-300 dark:border-gray-600 hover:border-primary/70'
                                                }`}
                                            >
                                                {isDone && (
                                                    <svg
                                                        className="w-3 h-3"
                                                        viewBox="0 0 12 12"
                                                        fill="none"
                                                    >
                                                        <path
                                                            d="M2 6l3 3 5-5"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    </svg>
                                                )}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                                                        {step.icon}
                                                    </span>
                                                    <span
                                                        className={`text-sm leading-relaxed ${
                                                            isDone
                                                                ? 'line-through text-gray-400 dark:text-gray-500'
                                                                : 'text-gray-800 dark:text-gray-200'
                                                        }`}
                                                    >
                                                        <span className="font-medium text-muted-foreground mr-1">
                                                            {step.id}.
                                                        </span>
                                                        {step.text}
                                                    </span>
                                                </div>
                                            </div>
                                            {step.href && step.linkLabel && (
                                                <Link
                                                    href={step.href}
                                                    className="flex-shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap mt-0.5"
                                                >
                                                    {step.linkLabel} →
                                                </Link>
                                            )}
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                ))}
            </main>
        </AdminGate>
    );
}
