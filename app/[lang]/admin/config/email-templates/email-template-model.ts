export type EmailTemplate = {
    id: string;
    name: string;
    subject: string;
    body: string;
    variables: string[];
    updatedAt: string;
};

export type TemplateGuide = {
    category: 'orders' | 'access' | 'security';
    language: 'RU' | 'EN' | 'LV' | 'RU · EN · LV';
    trigger: [string, string, string];
    audience: [string, string, string];
};

export function guideFor(id: string): TemplateGuide {
    const language = id.endsWith('-en') ? 'EN' : id.endsWith('-lv') ? 'LV' : id === 'pro-invite' ? 'RU · EN · LV' : 'RU';
    if (id.startsWith('order-confirmation')) return { category: 'orders', language, trigger: ['Сразу после оформления заказа', 'Immediately after checkout', 'Uzreiz pēc pasūtījuma noformēšanas'], audience: ['Покупатель', 'Customer', 'Klients'] };
    if (id.startsWith('order-shipped')) return { category: 'orders', language, trigger: ['При смене статуса на «Отправлен»', 'When status changes to Shipped', 'Kad statuss mainās uz Nosūtīts'], audience: ['Покупатель', 'Customer', 'Klients'] };
    if (id.startsWith('order-delivered')) return { category: 'orders', language, trigger: ['При смене статуса на «Доставлен»', 'When status changes to Delivered', 'Kad statuss mainās uz Piegādāts'], audience: ['Покупатель', 'Customer', 'Klients'] };
    if (id.startsWith('password-reset')) return { category: 'security', language, trigger: ['После запроса сброса пароля; ссылка действует 1 час', 'After a password reset request; link valid for 1 hour', 'Pēc paroles atiestatīšanas pieprasījuma; saite derīga 1 stundu'], audience: ['Пользователь аккаунта', 'Account user', 'Konta lietotājs'] };
    if (id.startsWith('access-request-rejected')) return { category: 'access', language, trigger: ['После отклонения заявки на карту', 'After a client-card request is rejected', 'Pēc klienta kartes pieteikuma noraidīšanas'], audience: ['Заявитель', 'Applicant', 'Pieteikuma iesniedzējs'] };
    if (id === 'card-rules-ru') return { category: 'access', language, trigger: ['Ручная рассылка правил получения карты', 'Manual client-card rules campaign', 'Manuāla klienta kartes noteikumu kampaņa'], audience: ['Потенциальный профессиональный клиент', 'Prospective professional customer', 'Potenciālais profesionālais klients'] };
    if (id === 'card-activated') return { category: 'security', language: 'RU · EN · LV', trigger: ['Сразу после самостоятельной активации существующей карты', 'Immediately after an existing card is self-activated', 'Uzreiz pēc esošas kartes pašaktivizācijas'], audience: ['Владелец карты — уведомление безопасности', 'Cardholder — security notice', 'Kartes turētājs — drošības paziņojums'] };
    return { category: 'access', language, trigger: ['После одобрения заявки или ручной отправки приглашения; ссылка действует 7 дней', 'After approval or a manual invitation; link valid for 7 days', 'Pēc apstiprināšanas vai manuāla ielūguma; saite derīga 7 dienas'], audience: ['Одобренный держатель карты', 'Approved cardholder', 'Apstiprināts kartes turētājs'] };
}

export function renderPreview(body: string, vars: string[], language: 'ru' | 'en' | 'lv'): string {
    const SAMPLE: Record<string, string> = {
        order_id: 'ORD-2026-001',
        first_name: language === 'ru' ? 'Иван' : language === 'lv' ? 'Jānis' : 'John',
        last_name: language === 'ru' ? 'Петров' : language === 'lv' ? 'Bērziņš' : 'Smith',
        total: '€155.00',
        items_list:
            language === 'ru'
                ? 'Шампунь Pro 500 мл × 2, Маска Hair × 1'
                : language === 'lv'
                  ? 'Šampūns Pro 500 ml × 2, Maska Hair × 1'
                  : 'Pro Shampoo 500 ml × 2, Hair Mask × 1',
        tracking_number: 'LV123456789',
        delivery_date:
            language === 'ru' ? '30 мая 2025' : language === 'lv' ? '2025. gada 30. maijs' : 'May 30, 2025',
        store_name: 'hairshoppro.lv',
        email: 'ivan@example.com',
        reset_link: '#',
        rfq_id: 'RFQ-2025-042',
        name: language === 'ru' ? 'Иван Петров' : language === 'lv' ? 'Jānis Bērziņš' : 'John Smith',
        card_number: '123456',
        invite_link: 'https://hairshoppro.lv/auth/invite?token=example',
        registration_link: 'https://hairshoppro.lv/auth/register',
        site_url: 'https://hairshoppro.lv',
        note_block: '',
    };
    let result = body;
    vars.forEach((v) => {
        result = result.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), SAMPLE[v] ?? `[${v}]`);
    });
    return result;
}

