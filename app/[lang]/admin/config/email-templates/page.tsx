'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { guideFor, renderPreview, type EmailTemplate, type TemplateGuide } from './email-template-model';
import { loadEmailTemplates, saveEmailTemplate, sendEmailTemplateTest } from './email-template-api';

export default function EmailTemplatesPage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [selected, setSelected] = useState<EmailTemplate | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [tab, setTab] = useState<'edit' | 'preview'>('preview');
    const [testEmail, setTestEmail] = useState('');
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
    const [search, setSearch] = useState('');
    const subjectRef = useRef(subject);
    const bodyRef = useRef(body);
    const selectedRef = useRef(selected);

    useEffect(() => {
        subjectRef.current = subject;
        bodyRef.current = body;
        selectedRef.current = selected;
    }, [body, selected, subject]);

    const hasUnsavedChanges = (): boolean => {
        const current = selectedRef.current;
        return Boolean(current && (subjectRef.current !== current.subject || bodyRef.current !== current.body));
    };

    const load = () => {
        setLoading(true);
        setLoadError(false);
        loadEmailTemplates()
            .then((loaded) => {
                setTemplates(loaded);
                if (!selectedRef.current && loaded[0]) {
                    setSelected(loaded[0]);
                    setSubject(loaded[0].subject);
                    setBody(loaded[0].body);
                }
            })
            .catch(() => {
                setTemplates([]);
                setLoadError(true);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        queueMicrotask(() => void load());
    }, []);

    useEffect(() => {
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges()) return;
            event.preventDefault();
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, []);

    const select = (t: EmailTemplate) => {
        if (hasUnsavedChanges() && !window.confirm(l(
            'Несохранённые изменения будут потеряны. Продолжить?',
            'Unsaved changes will be lost. Continue?',
            'Nesaglabātās izmaiņas tiks zaudētas. Vai turpināt?'
        ))) return;
        setSelected(t);
        setSubject(t.subject);
        setBody(t.body);
        setSaved(false);
        setSaveError(false);
        setTab('preview');
    };

    const save = async () => {
        if (!selected) return;
        setSaving(true);
        setSaved(false);
        setSaveError(false);
        try {
            const savedTemplate = await saveEmailTemplate(selected.id, subject, body);
            setTemplates((prev) => prev.map((t) => (t.id === selected.id ? savedTemplate : t)));
            setSelected(savedTemplate);
            setSaved(true);
        } catch {
            setSaveError(true);
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        if (!selected) return;
        setSubject(selected.subject);
        setBody(selected.body);
        setSaved(false);
        setSaveError(false);
    };

    const sendTest = async () => {
        if (!selected || !testEmail) return;
        setTestSending(true);
        setTestResult(null);
        try {
            setTestResult(await sendEmailTemplateTest(selected.id, testEmail) ? 'ok' : 'error');
        } catch {
            setTestResult('error');
        } finally {
            setTestSending(false);
        }
    };

    const isDirty = selected && (subject !== selected.subject || body !== selected.body);
    const filteredTemplates = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!query) return templates;
        return templates.filter((template) => {
            const guide = guideFor(template.id);
            return `${template.name} ${template.subject} ${guide.language}`.toLocaleLowerCase().includes(query);
        });
    }, [search, templates]);
    const selectedGuide = selected ? guideFor(selected.id) : null;
    const categoryLabel = (category: TemplateGuide['category']): string => ({
        orders: l('Заказы', 'Orders', 'Pasūtījumi'),
        access: l('Доступ и карты', 'Access & cards', 'Piekļuve un kartes'),
        security: l('Безопасность', 'Security', 'Drošība'),
    })[category];

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

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold">{templates.length}</p><p className="text-xs text-muted-foreground">{l('актуальных шаблонов', 'active templates', 'aktīvās veidnes')}</p></div>
                    <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold">3</p><p className="text-xs text-muted-foreground">{l('языка: RU, EN, LV', 'languages: RU, EN, LV', 'valodas: RU, EN, LV')}</p></div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{l('Invite-регистрация', 'Invite registration', 'Reģistrācija ar ielūgumu')}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{l('Одноразовая ссылка, 7 дней', 'One-time link, 7 days', 'Vienreizēja saite, 7 dienas')}</p></div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                    <p className="font-semibold">{l('Как работать с шаблонами', 'How templates work', 'Kā darbojas veidnes')}</p>
                    <p className="mt-1 text-xs leading-5">{l('Выберите письмо, проверьте событие отправки и получателя, затем откройте редактор. Не удаляйте переменные в фигурных скобках: система заменяет их реальными данными.', 'Choose an email, verify its trigger and recipient, then open the editor. Do not remove variables in braces: the system replaces them with real data.', 'Izvēlieties e-pastu, pārbaudiet nosūtīšanas notikumu un saņēmēju, pēc tam atveriet redaktoru. Neizdzēsiet mainīgos figūriekavās: sistēma tos aizstāj ar reāliem datiem.')}</p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                            <div className="border-b border-border px-4 py-3">
                                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">{l('Шаблоны', 'Templates', 'Veidnes')}</h2><span className="text-xs text-muted-foreground">{filteredTemplates.length}/{templates.length}</span></div>
                                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={l('Поиск по названию или языку', 'Search by name or language', 'Meklēt pēc nosaukuma vai valodas')} className="mt-3 h-9 text-sm" />
                            </div>
                            {loading ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    {l('Загрузка...', 'Loading...', 'Ielāde...')}
                                </div>
                            ) : loadError ? (
                                <div className="space-y-3 px-4 py-6 text-center" role="alert">
                                    <p className="text-sm text-red-700 dark:text-red-300">
                                        {l('Не удалось загрузить шаблоны.', 'Failed to load templates.', 'Neizdevās ielādēt veidnes.')}
                                    </p>
                                    <button type="button" onClick={load} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                                        {l('Повторить', 'Retry', 'Mēģināt vēlreiz')}
                                    </button>
                                </div>
                            ) : filteredTemplates.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                                    {l('Подходящие шаблоны не найдены.', 'No matching templates found.', 'Atbilstošas veidnes nav atrastas.')}
                                </p>
                            ) : (
                                <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                                    {filteredTemplates.map((t) => {
                                        const guide = guideFor(t.id);
                                        return (
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
                                                <div className="mt-2 flex gap-1.5"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{categoryLabel(guide.category)}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{guide.language}</span></div>
                                            </button>
                                        </li>
                                    )})}
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

                                {selectedGuide && (
                                    <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
                                        <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l('Когда отправляется', 'When it is sent', 'Kad tiek nosūtīts')}</p><p className="mt-1 text-sm">{l(...selectedGuide.trigger)}</p></div>
                                        <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l('Получатель', 'Recipient', 'Saņēmējs')}</p><p className="mt-1 text-sm">{l(...selectedGuide.audience)}</p></div>
                                    </div>
                                )}

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
                                                        <button
                                                            type="button"
                                                            key={v}
                                                            onClick={() => setBody((current) => `${current}${current.endsWith('\n') ? '' : '\n'}{{${v}}}`)}
                                                            title={l('Добавить переменную в конец письма', 'Append variable to email', 'Pievienot mainīgo e-pasta beigās')}
                                                            className="rounded bg-white px-1.5 py-0.5 text-xs text-emerald-700 shadow-sm hover:bg-emerald-50 dark:bg-gray-700 dark:text-emerald-400"
                                                        >
                                                            {`{{${v}}}`}
                                                        </button>
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
                                            {saveError && (
                                                <span className="text-sm text-red-700 dark:text-red-300" role="alert">
                                                    {l('Не удалось сохранить изменения.', 'Failed to save changes.', 'Neizdevās saglabāt izmaiņas.')}
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
                                        <div className="overflow-hidden rounded-xl border border-border bg-white">
                                            <iframe
                                                title={l('Предпросмотр письма', 'Email preview', 'E-pasta priekšskatījums')}
                                                sandbox=""
                                                srcDoc={renderPreview(body, selected.variables, language)}
                                                className="h-[32rem] w-full border-0 bg-white"
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
