'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompanyStore, type CompanyProfile } from '@/lib/company-store';
import {
    getCurrentUser,
    listCompanyUsers,
    updateUserTeamRole,
    type TeamRole,
} from '@/lib/auth';
import AdminGate from '@/components/admin/AdminGate';
import IconSearch from '@/components/ui/icon-search';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';

// Для заявок мастеров: короткий номер от 4 до 6 цифр, уникальный среди всех карт
const generateShortCardNumber = (companies: CompanyProfile[]): string => {
    const existing = new Set(
        companies.map((c) => (c.cardNumber ?? '').replace(/\D/g, '')).filter(Boolean)
    );
    const max = companies.reduce((acc, c) => {
        const digits = (c.cardNumber ?? '').replace(/\D/g, '');
        if (digits.length < 4 || digits.length > 6) return acc;
        const n = Number(digits);
        return isNaN(n) ? acc : Math.max(acc, n);
    }, 999);
    let candidate = max + 1;
    while (existing.has(String(candidate))) candidate++;
    return String(candidate);
};

// Заявка мастера из Neon (GET /api/admin/access-requests); certificateData
// (картинка) на сервер не передаётся — есть только certificateName
type NoCardRequest = {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    requestType: string;
    certificateName: string | null;
    message: string | null;
    language: string | null;
    requestedAt: string;
};

export default function AdminClientBarcodesPage() {
    const { t, language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const tl = (
        key: string,
        ru: string,
        en: string,
        lv: string,
        params?: Record<string, string | number>
    ) => t(key, l(ru, en, lv), params);

    const [formError, setFormError] = useState('');
    const [message, setMessage] = useState('');
    const [memberRolesDraft, setMemberRolesDraft] = useState<Record<string, TeamRole>>({});
    const [roleUpdateInProgress, setRoleUpdateInProgress] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const { getCompanies } = useCompanyStore();
    const companies = getCompanies();

    // Заявки мастеров — из Neon, не из localStorage: клиент подаёт заявку со
    // своего браузера, локальный store админа её не видит
    const [noCardRequests, setNoCardRequests] = useState<NoCardRequest[]>([]);
    const loadNoCardRequests = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/access-requests?status=pending');
            if (!res.ok) return;
            const json = await res.json();
            setNoCardRequests(
                ((json.requests ?? []) as NoCardRequest[]).filter((r) => r.requestType === 'no-card')
            );
        } catch { /* сеть — оставляем прежний список */ }
    }, []);
    useEffect(() => { void loadNoCardRequests(); }, [loadNoCardRequests]);

    const filteredCompanies = search.trim()
        ? (() => {
              const q = search.trim().toLowerCase();
              return companies.filter((c) => {
                  const users = listCompanyUsers(c.companyId);
                  return (
                      c.companyName.toLowerCase().includes(q) ||
                      (c.cardNumber ?? '').toLowerCase().includes(q) ||
                      (c.contactEmail ?? '').toLowerCase().includes(q) ||
                      (c.contactPhone ?? '').toLowerCase().includes(q) ||
                      (c.taxId ?? '').toLowerCase().includes(q) ||
                      (c.registrationNumber ?? '').toLowerCase().includes(q) ||
                      (c.city ?? '').toLowerCase().includes(q) ||
                      (c.country ?? '').toLowerCase().includes(q) ||
                      users.some(
                          (u) =>
                              (u.name ?? '').toLowerCase().includes(q) ||
                              u.email.toLowerCase().includes(q)
                      )
                  );
              });
          })()
        : companies;

    const [noCardDrafts, setNoCardDrafts] = useState<Record<string, { companyName: string; cardNumber: string }>>({});
    const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
    const [emailBusy, setEmailBusy] = useState<Record<string, boolean>>({});

    const getNoCardDraft = (requestId: string, defaultName: string) => {
        if (!noCardDrafts[requestId]) {
            const generated = generateShortCardNumber(companies);
            setNoCardDrafts((prev) => ({
                ...prev,
                [requestId]: { companyName: defaultName, cardNumber: generated },
            }));
            return { companyName: defaultName, cardNumber: generated };
        }
        return noCardDrafts[requestId];
    };

    const handleApproveNoCardRequest = async (requestId: string, email: string, name: string) => {
        const draft = noCardDrafts[requestId];
        if (!draft) return;
        const digits = draft.cardNumber.replace(/\D/g, '');
        if (digits.length < 4 || digits.length > 6) {
            setFormError('Номер карты должен содержать от 4 до 6 цифр.');
            return;
        }
        setEmailBusy((prev) => ({ ...prev, [requestId]: true }));
        try {
            // Сервер создаёт спящий аккаунт с картой — клиент сразу попадает
            // в список держателей на /admin/invitations
            const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'approved', cardNumber: digits, companyName: draft.companyName }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                setFormError(
                    json.error === 'card_taken'
                        ? `Номер ${digits} уже занят — укажите другой.`
                        : json.error === 'user_has_card'
                        ? `У клиента уже есть карта №${json.cardNumber}.`
                        : 'Не удалось одобрить заявку'
                );
                setMessage('');
                return;
            }
            setNoCardDrafts((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            try {
                await fetch('/api/admin/card-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approve', email, name, cardNumber: digits, language: noCardRequests.find(r => r.id === requestId)?.language ?? 'ru' }),
                });
                setMessage(`Карта выдана: ${digits}. Письмо отправлено на ${email}.`);
            } catch {
                setMessage(`Карта выдана: ${digits}. Не удалось отправить письмо.`);
            }
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
        }
    };

    const handleRejectNoCardRequest = async (requestId: string, email: string, name: string) => {
        const note = rejectNotes[requestId]?.trim() || undefined;
        setEmailBusy((prev) => ({ ...prev, [requestId]: true }));
        try {
            const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'rejected', reviewNote: note ?? 'Отклонено администратором' }),
            });
            if (!res.ok) {
                setFormError('Не удалось отклонить заявку');
                setMessage('');
                return;
            }
            try {
                await fetch('/api/admin/card-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject', email, name, note, language: noCardRequests.find(r => r.id === requestId)?.language ?? 'ru' }),
                });
                setMessage(`Заявка отклонена. Уведомление отправлено на ${email}.`);
            } catch {
                setMessage('Заявка отклонена. Не удалось отправить уведомление.');
            }
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            setRejectNotes((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
        }
    };

    const resolveMemberRoleDraft = (userId: string, fallbackRole: TeamRole): TeamRole =>
        memberRolesDraft[userId] ?? fallbackRole;

    const handleUpdateTeamMemberRole = (userId: string, fallbackRole: TeamRole) => {
        const reviewer = getCurrentUser();
        const nextRole = resolveMemberRoleDraft(userId, fallbackRole);

        setRoleUpdateInProgress(userId);
        setFormError('');
        setMessage('');

        const result = updateUserTeamRole(userId, nextRole, reviewer);
        if (!result.success) {
            setFormError(
                result.error ||
                    tl('admin.clientBarcodes.msg.updateRoleFailed', 'Не удалось изменить роль', 'Failed to change role', 'Neizdevas nomainit lomu')
            );
            setRoleUpdateInProgress(null);
            return;
        }

        setMemberRolesDraft((prev) => ({ ...prev, [userId]: nextRole }));
        setMessage(tl('admin.clientBarcodes.msg.roleUpdated', 'Роль пользователя обновлена', 'User role updated', 'Lietotaja loma atjaunota'));
        setRoleUpdateInProgress(null);
    };

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-foreground">
                            {tl('admin.clientBarcodes.title', 'Клиентские баркоды', 'Client barcodes', 'Klientu barkodi')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tl('admin.clientBarcodes.subtitle', 'Управление компаниями и баркодами для активации аккаунтов.', 'Manage companies and barcodes for account activation.', 'Uznemumu un barkodu parvaldiba kontu aktivizacijai.')}
                        </p>
                        <div className="relative mt-3 w-full max-w-sm">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Поиск по карте, имени, email, телефону..."
                                className="h-9 pl-9"
                            />
                        </div>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {tl('admin.clientBarcodes.backToAdmin', 'Назад в админку', 'Back to admin', 'Atpakal uz admin')}
                        </Button>
                    </Link>
                </div>

                {(formError || message) && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                        {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                        {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                    </div>
                )}

                {/* ── Заявки мастеров без карты ── */}
                <section className="rounded-lg border border-amber-200 dark:border-amber-800 bg-card p-6">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-foreground">
                            Заявки мастеров (без карты){' '}
                            <span className="ml-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                                {noCardRequests.length}
                            </span>
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Мастера, приложившие сертификат через форму регистрации. Укажите название компании и сгенерируйте номер карты для выдачи.
                        </p>
                    </div>

                    {noCardRequests.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            Новых заявок от мастеров нет.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {noCardRequests.map((req) => {
                                const draft = getNoCardDraft(req.id, req.name || req.email);
                                return (
                                    <div key={req.id} className="rounded-lg border border-border p-4 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1 min-w-0">
                                                <p className="font-semibold text-foreground">
                                                    {req.name || req.email}
                                                </p>
                                                <p className="text-sm text-muted-foreground">Email: {req.email}</p>
                                                {req.phone && (
                                                    <p className="text-sm text-muted-foreground">Телефон: {req.phone}</p>
                                                )}
                                                <p className="text-sm text-gray-400 dark:text-gray-500">
                                                    {new Date(req.requestedAt).toLocaleString('ru-RU')}
                                                </p>
                                            </div>
                                            {req.certificateName && (
                                                <span className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 shrink-0">
                                                    📄 {req.certificateName}
                                                </span>
                                            )}
                                        </div>

                                        {req.message && (
                                            <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground italic">
                                                «{req.message}»
                                            </p>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                            <label className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">Название компании</span>
                                                <Input
                                                    value={draft.companyName}
                                                    onChange={(e) =>
                                                        setNoCardDrafts((prev) => ({
                                                            ...prev,
                                                            [req.id]: { ...draft, companyName: e.target.value },
                                                        }))
                                                    }
                                                    placeholder="Имя мастера / ИП"
                                                />
                                            </label>
                                            <label className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">Номер карты</span>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={draft.cardNumber}
                                                        onChange={(e) =>
                                                            setNoCardDrafts((prev) => ({
                                                                ...prev,
                                                                [req.id]: { ...draft, cardNumber: e.target.value },
                                                            }))
                                                        }
                                                        placeholder="1000"
                                                        className="font-mono"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="shrink-0"
                                                        onClick={() =>
                                                            setNoCardDrafts((prev) => ({
                                                                ...prev,
                                                                [req.id]: { ...draft, cardNumber: generateShortCardNumber(companies) },
                                                            }))
                                                        }
                                                    >
                                                        ↺
                                                    </Button>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="pt-1">
                                            <label className="text-sm text-muted-foreground block mb-1">
                                                Комментарий к отказу{' '}
                                                <span className="text-gray-400 dark:text-gray-500">(необязательно — будет добавлен в письмо)</span>
                                            </label>
                                            <textarea
                                                value={rejectNotes[req.id] ?? ''}
                                                onChange={(e) =>
                                                    setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                                                }
                                                rows={2}
                                                placeholder="Например: предоставленный документ не является действующим сертификатом..."
                                                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={emailBusy[req.id]}
                                                onClick={() => handleApproveNoCardRequest(req.id, req.email, req.name || req.email)}
                                            >
                                                {emailBusy[req.id] ? 'Отправка...' : 'Выдать карту и уведомить'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={emailBusy[req.id]}
                                                onClick={() => handleRejectNoCardRequest(req.id, req.email, req.name || req.email)}
                                            >
                                                Отклонить
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* ── Список клиентов ── */}
                <section className="rounded-lg border border-border bg-card p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {tl('admin.clientBarcodes.companies', 'Компании', 'Companies', 'Uznemumi')}{' '}
                        <span className="text-gray-400 dark:text-gray-500 font-normal text-base">
                            {search.trim() ? `${filteredCompanies.length} / ${companies.length}` : companies.length}
                        </span>
                    </h2>

                    {filteredCompanies.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            Ничего не найдено по запросу «{search}»
                        </p>
                    )}

                    <div className="space-y-3">
                        {filteredCompanies.map((company) => {
                            const companyUsers = listCompanyUsers(company.companyId);

                            return (
                                <div
                                    key={company.companyId}
                                    className="rounded-lg border border-border p-4"
                                >
                                    <div className="space-y-1">
                                        <p className="font-semibold text-foreground">
                                            {company.companyName}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            ID: {company.companyId}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {tl('admin.clientBarcodes.barcode', 'Баркод', 'Barcode', 'Barkods')}:{' '}
                                            {company.cardNumber || tl('admin.clientBarcodes.notSet', 'не задан', 'not set', 'nav iestatits')}
                                        </p>
                                        {company.contactEmail && (
                                            <p className="text-sm text-muted-foreground">
                                                Email: {company.contactEmail}
                                            </p>
                                        )}
                                        {company.contactPhone && (
                                            <p className="text-sm text-muted-foreground">
                                                Телефон: {company.contactPhone}
                                            </p>
                                        )}
                                        <p className="text-sm text-muted-foreground">
                                            {tl('admin.clientBarcodes.team', 'Команда', 'Team', 'Komanda')}:{' '}
                                            {company.teamMembers.length}{' '}
                                            {tl('admin.clientBarcodes.users', 'пользователей', 'users', 'lietotaji')}
                                        </p>
                                    </div>

                                    {companyUsers.length > 0 && (
                                        <div className="mt-4 rounded-md border border-border p-3">
                                            <p className="text-sm font-medium text-foreground mb-3">
                                                {tl('admin.clientBarcodes.accountsAndRoles', 'Аккаунты компании и роли', 'Company accounts and roles', 'Uznemuma konti un lomas')}
                                            </p>
                                            <div className="space-y-2">
                                                {companyUsers.map((companyUser) => {
                                                    const selectedRole = resolveMemberRoleDraft(
                                                        companyUser.id,
                                                        companyUser.teamRole ?? 'viewer'
                                                    );
                                                    const isBusy = roleUpdateInProgress === companyUser.id;

                                                    return (
                                                        <div
                                                            key={companyUser.id}
                                                            className="grid grid-cols-1 gap-2 rounded border border-border p-2 md:grid-cols-[1.5fr_1fr_auto] md:items-center"
                                                        >
                                                            <div>
                                                                <p className="text-sm font-medium text-foreground">
                                                                    {companyUser.name || companyUser.email}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {companyUser.email}
                                                                </p>
                                                            </div>
                                                            <Select
                                                                value={selectedRole}
                                                                onValueChange={(value) => {
                                                                    const role = value as TeamRole;
                                                                    setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }));
                                                                }}
                                                            >
                                                                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="viewer">viewer</SelectItem>
                                                                    <SelectItem value="buyer">buyer</SelectItem>
                                                                    <SelectItem value="manager">manager</SelectItem>
                                                                    <SelectItem value="admin">admin</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={isBusy}
                                                                onClick={() => handleUpdateTeamMemberRole(companyUser.id, companyUser.teamRole ?? 'viewer')}
                                                            >
                                                                {isBusy
                                                                    ? tl('admin.clientBarcodes.saving', 'Сохраняем...', 'Saving...', 'Saglabajam...')
                                                                    : tl('admin.clientBarcodes.changeRole', 'Сменить роль', 'Change role', 'Mainit lomu')}
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>
        </AdminGate>
    );
}
