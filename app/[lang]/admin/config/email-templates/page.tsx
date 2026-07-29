'use client';

import { useEffect, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';

type EmailTemplate = {
    id: string;
    name: string;
    subject: string;
    body: string;
    variables: string[];
    updatedAt: string;
};

function renderPreview(body: string, vars: string[]): string {
    const SAMPLE: Record<string, string> = {
        order_id: 'ORD-2025-001',
        first_name: 'Иван',
        last_name: 'Петров',
        total: '15 500',
        items_list: 'Шампунь Pro 500мл × 2, Маска Hair × 1',
        tracking_number: 'RU123456789',
        delivery_date: '30 мая 2025',
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
                        Редактор email-шаблонов
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Настройка текстов для транзакционных писем. Используйте{' '}
                        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
                            {'{{variable}}'}
                        </code>{' '}
                        для подстановки данных.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Шаблоны
                                </h2>
                            </div>
                            {loading ? (
                                <div className="py-8 text-center text-sm text-gray-400">Загрузка...</div>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
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
                                                <p className="mt-0.5 truncate text-xs text-gray-400">
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
                            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-700">
                                Выберите шаблон для редактирования
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-4">
                                    <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                                        {selected.name}
                                    </h2>
                                    <div className="flex gap-2">
                                        <div className="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
                                            <button
                                                type="button"
                                                onClick={() => setTab('edit')}
                                                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                                                    tab === 'edit'
                                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                Редактор
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
                                                Превью
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {tab === 'edit' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label htmlFor="email-template-subject" className="mb-1 block text-xs font-medium text-muted-foreground">
                                                Тема письма
                                            </label>
                                            <input
                                                id="email-template-subject"
                                                value={subject}
                                                onChange={(e) => setSubject(e.target.value)}
                                                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="email-template-body" className="mb-1 block text-xs font-medium text-muted-foreground">
                                                HTML-тело письма
                                            </label>
                                            <textarea
                                                id="email-template-body"
                                                value={body}
                                                onChange={(e) => setBody(e.target.value)}
                                                rows={14}
                                                className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-xs leading-relaxed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                            />
                                        </div>
                                        {selected.variables.length > 0 && (
                                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                                    Доступные переменные:
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
                                                {saving ? 'Сохранение...' : 'Сохранить'}
                                            </button>
                                            {isDirty && (
                                                <button
                                                    type="button"
                                                    onClick={reset}
                                                    className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                                                >
                                                    Отменить
                                                </button>
                                            )}
                                            {saved && !isDirty && (
                                                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                                                    Сохранено
                                                </span>
                                            )}
                                        </div>

                                        <div className="rounded-lg border border-border px-4 py-3 space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                Отправить тестовое письмо
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="email"
                                                    placeholder="email@example.com"
                                                    value={testEmail}
                                                    onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
                                                    className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={sendTest}
                                                    disabled={testSending || !testEmail}
                                                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap"
                                                >
                                                    {testSending ? 'Отправка...' : 'Отправить'}
                                                </button>
                                            </div>
                                            {testResult === 'ok' && (
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                                    Письмо отправлено на {testEmail}
                                                </p>
                                            )}
                                            {testResult === 'error' && (
                                                <p className="text-xs text-red-600 dark:text-red-400">
                                                    Не удалось отправить. Проверьте настройки SMTP.
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                                Используются тестовые данные вместо переменных.
                                                {!process.env.NEXT_PUBLIC_SMTP_CONFIGURED && ' SMTP настраивается через переменные окружения.'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                                            <span className="text-xs text-gray-500">Тема: </span>
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                                {renderPreview(subject, selected.variables)}
                                            </span>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
                                            <div
                                                className="prose prose-sm max-w-none dark:prose-invert"
                                                dangerouslySetInnerHTML={{
                                                    __html: renderPreview(body, selected.variables),
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400">
                                            Превью использует тестовые данные для подстановки переменных
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
