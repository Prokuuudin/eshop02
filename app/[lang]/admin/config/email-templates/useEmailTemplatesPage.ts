'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { guideFor, type EmailTemplate, type TemplateGuide } from './email-template-model';
import { loadEmailTemplates, saveEmailTemplate, sendEmailTemplateTest } from './email-template-api';

function useEmailTemplatesPageState() {
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
                    const requestedId = new URLSearchParams(window.location.search).get('template');
                    const initial = loaded.find((template) => template.id === requestedId) ?? loaded[0];
                    setSelected(initial);
                    setSubject(initial.subject);
                    setBody(initial.body);
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

    const select = (template: EmailTemplate) => {
        if (hasUnsavedChanges() && !window.confirm(l(
            'Несохранённые изменения будут потеряны. Продолжить?',
            'Unsaved changes will be lost. Continue?',
            'Nesaglabātās izmaiņas tiks zaudētas. Vai turpināt?'
        ))) return;
        setSelected(template);
        setSubject(template.subject);
        setBody(template.body);
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
            setTemplates((previous) => previous.map((template) => (
                template.id === selected.id ? savedTemplate : template
            )));
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

    const isDirty = Boolean(selected && (subject !== selected.subject || body !== selected.body));
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

    return {
        language, l, templates, loading, loadError, selected, subject, setSubject, body, setBody,
        saving, saved, saveError, tab, setTab, testEmail, setTestEmail, testSending, testResult,
        setTestResult, search, setSearch, load, select, save, reset, sendTest, isDirty,
        filteredTemplates, selectedGuide, categoryLabel,
    };
}

export function useEmailTemplatesPage(): ReturnType<typeof useEmailTemplatesPageState> {
    return useEmailTemplatesPageState();
}
