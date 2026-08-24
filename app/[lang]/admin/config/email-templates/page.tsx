'use client';

import { useEffect, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAdminLocale } from '@/lib/use-admin-locale';

type EmailTemplate = {
    id: string;
    name: string;
    subject: string;
    body: string;
    variables: string[];
    updatedAt: string;
};

function renderPreview(body: string, vars: string[], language: 'ru' | 'en' | 'lv'): string {
    const SAMPLE: Record<string, string> = {
        order_id: 'ORD-2025-001',
        first_name: language === 'ru' ? 'Иван' : language === 'lv' ? 'Jānis' : 'John',
        last_name: language === 'ru' ? 'Петров' : language === 'lv' ? 'Bērziņš' : 'Smith',
        total: '15 500',
        items_list:
            language === 'ru'
                ? 'Шампунь Pro 500 мл × 2, Маска Hair × 1'
                : language === 'lv'
                  ? 'Šampūns Pro 500 ml × 2, Maska Hair × 1'
                  : 'Pro Shampoo 500 ml × 2, Hair Mask × 1',
        tracking_number: 'RU123456789',
        delivery_date:
            language === 'ru' ? '30 мая 2025' : language === 'lv' ? '2025. gada 30. maijs' : 'May 30, 2025',
        store_name: 'ProBeauty',
        email: 'ivan@example.com',
        reset_link: '#',
        rfq_id: 'RFQ-2025-042',
    };
    let result = body;
    vars.forEach((v) => {
        result = result.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), SAMPLE[v] ?? `[${v}]`);
    });
    return result;
}

export default function EmailTemplatesPage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<EmailTemplate | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState<'edit' | 'preview'>('edit');
    const [testEmail, setTestEmail] = useState('');
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);

    const load = () => {
        setLoading(true);
        fetch('/api/admin/email-templates')
            .then((r) => r.json())
            .then((data: EmailTemplate[]) => setTemplates(Array.isArray(data) ? data : []))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        queueMicrotask(() => void load());
    }, []);

    const select = (t: EmailTemplate) => {
        setSelected(t);
        setSubject(t.subject);
        setBody(t.body);
        setSaved(false);
        setTab('edit');
    };

    const save = async () => {
        if (!selected) return;
        setSaving(true);
        setSaved(false);
        await fetch(`/api/admin/email-templates/${selected.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, body }),
        });
        setSaving(false);
        setSaved(true);
        setTemplates((prev) =>
            prev.map((t) => (t.id === selected.id ? { ...t, subject, body } : t))
        );
        setSelected((prev) => (prev ? { ...prev, subject, body } : null));
    };

    const reset = () => {
        if (!selected) return;
        setSubject(selected.subject);
        setBody(selected.body);
        setSaved(false);
    };

    const sendTest = async () => {
        if (!selected || !testEmail) return;
        setTestSending(true);
        setTestResult(null);
        try {
            const res = await fetch(`/api/admin/email-templates/${selected.id}/send-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: testEmail }),
            });
            setTestResult(res.ok ? 'ok' : 'error');
        } catch {
            setTestResult('error');
        } finally {
            setTestSending(false);
        }
    };

    const isDirty = selected && (subject !== selected.subject || body !== selected.body);

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {l('Редактор email-шаблонов', 'Email template editor', 'E-pasta veidņu redaktors')}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {l(
                            'Настройка текстов для транзакционных писем. Используйте',
                            'Configure transactional email content. Use',
                            'Pielāgojiet transakciju e-pastu saturu. Izmantojiet'
                        )}{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            {'{{variable}}'}
                        </code>{' '}
                        {l(
                            'для подстановки данных.',
                            'to insert data.',
                            'datu ievietošanai.'
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <h2 className="text-sm font-semibold text-foreground">
                                    {l('Шаблоны', 'Templates', 'Veidnes')}
                                </h2>
                            </div>
                            {loading ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    {l('Загрузка...', 'Loading...', 'Ielāde...')}
                                </div>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {templates.map((t) => (
                                        <li key={t.id}>
                                            <button
                                                type="button"
                                                onClick={() => select(t)}
                                                className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                                    selected?.id === t.id
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                                        : ''
                                                }`}
                                            >
                                                <p
                                                    className={`text-sm font-medium ${
                                                        selected?.id === t.id
                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                            : 'text-gray-800 dark:text-gray-200'
                                                    }`}
                                                >
                                                    {t.name}
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                    {t.subject}
                                                </p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        {!selected ? (
                            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                                {l(
                                    'Выберите шаблон для редактирования',
                                    'Select a template to edit',
                                    'Izvēlieties veidni rediģēšanai'
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <h2 className="font-semibold text-foreground">
                                        {selected.name}
                                    </h2>
                                    <div className="flex gap-2">
                                        <div className="flex rounded-lg border border-border bg-card p-1">
                                            <button
                                                type="button"
                                                onClick={() => setTab('edit')}
                                                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                                                    tab === 'edit'
                                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                {l('Редактор', 'Editor', 'Redaktors')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTab('preview')}
                                                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                                                    tab === 'preview'
                                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                {l('Превью', 'Preview', 'Priekšskatījums')}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {tab === 'edit' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label htmlFor="email-template-subject" className="mb-1 block text-xs font-medium text-muted-foreground">
                                                {l('Тема письма', 'Email subject', 'E-pasta temats')}
                                            </label>
                                            <Input
                                                id="email-template-subject"
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                className="text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="email-template-body" className="mb-1 block text-xs font-medium text-muted-foreground">
                                                {l('HTML-тело письма', 'Email HTML body', 'E-pasta HTML saturs')}
                                            </label>
                                            <Textarea
                                                id="email-template-body"
                                                value={body}
                                                onChange={(e) => setBody(e.target.value)}
                                                rows={14}
                                                className="font-mono text-xs leading-relaxed"
                                            />
                                        </div>
                                        {selected.variables.length > 0 && (
                                            <div className="rounded-lg bg-muted px-3 py-2">
                                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                                    {l(
                                                        'Доступные переменные:',
                                                        'Available variables:',
                                                        'Pieejamie mainīgie:'
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selected.variables.map((v) => (
                                                        <code
                                                            key={v}
                                                            className="rounded bg-white px-1.5 py-0.5 text-xs text-emerald-700 shadow-sm dark:bg-gray-700 dark:text-emerald-400"
                                                        >
                                                            {`{{${v}}}`}
                                                        </code>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={save}
                                                disabled={saving || !isDirty}
                                                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                                            >
                                                {saving
                                                    ? l('Сохранение...', 'Saving...', 'Saglabā...')
                                                    : l('Сохранить', 'Save', 'Saglabāt')}
                                            </button>
                                            {isDirty && (
                                                <button
                                                    type="button"
                                                    onClick={reset}
                                                    className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50"
                                                >
                                                    {l('Отменить', 'Cancel', 'Atcelt')}
                                                </button>
                                            )}
                                            {saved && !isDirty && (
                                                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                                                    {l('Сохранено', 'Saved', 'Saglabāts')}
                                                </span>
                                            )}
                                        </div>

                                        <div className="rounded-lg border border-border px-4 py-3 space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {l(
                                                    'Отправить тестовое письмо',
                                                    'Send a test email',
                                                    'Nosūtīt testa e-pastu'
                                                )}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="email"
                                                    placeholder="email@example.com"
                                                    value={testEmail}
                                                    onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
                                                    className="h-9 flex-1 py-1.5 text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={sendTest}
                                                    disabled={testSending || !testEmail}
                                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
                                                >
                                                    {testSending
                                                        ? l('Отправка...', 'Sending...', 'Nosūta...')
                                                        : l('Отправить', 'Send', 'Nosūtīt')}
                                                </button>
                                            </div>
                                            {testResult === 'ok' && (
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                    {l(
                                                        `Письмо отправлено на ${testEmail}`,
                                                        `Email sent to ${testEmail}`,
                                                        `E-pasts nosūtīts uz ${testEmail}`
                                                    )}
                                                </p>
                                            )}
                                            {testResult === 'error' && (
                                                <p className="text-xs text-red-600 dark:text-red-400">
                                                    {l(
                                                        'Не удалось отправить. Проверьте настройки SMTP.',
                                                        'Failed to send. Check the SMTP settings.',
                                                        'Neizdevās nosūtīt. Pārbaudiet SMTP iestatījumus.'
                                                    )}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {l(
                                                    'Используются тестовые данные вместо переменных.',
                                                    'Sample data is used in place of variables.',
                                                    'Mainīgo vietā tiek izmantoti testa dati.'
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="rounded-md border border-border bg-muted px-3 py-2">
                                            <span className="text-xs text-muted-foreground">
                                                {l('Тема:', 'Subject:', 'Temats:')}{' '}
                                            </span>
                                            <span className="text-sm font-medium text-foreground">
                                                {renderPreview(subject, selected.variables, language)}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-border bg-card p-6">
                                            <div
                                                className="prose prose-sm max-w-none dark:prose-invert"
                                                dangerouslySetInnerHTML={{
                                                    __html: renderPreview(body, selected.variables, language),
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {l(
                                                'Превью использует тестовые данные для подстановки переменных',
                                                'The preview uses sample data for variable substitution',
                                                'Priekšskatījumā mainīgo aizstāšanai tiek izmantoti testa dati'
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminGate>
    );
}
