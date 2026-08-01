'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCompanyStore, type CompanyProfile } from '@/lib/company-store';
import {
    getCurrentUser,
    listCompanyUsers,
    updateUserTeamRole,
    type TeamRole,
} from '@/lib/auth';
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

function useAdminClientBarcodesPageState() {
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
    }, [setNoCardRequests]);
    useEffect(() => {
        queueMicrotask(() => void loadNoCardRequests());
    }, [loadNoCardRequests]);

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

    const handleApproveNoCardRequest = async (requestId: string, email: string) => {
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
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 502 && json.emailStatus === 'error') {
                    setNoCardDrafts((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
                    setFormError('');
                    setMessage(`Карта выдана: ${digits}, но письмо не отправлено. Повторите отправку в разделе «Приглашения».`);
                    return;
                }
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
            setMessage(`Карта выдана: ${digits}. Одноразовое приглашение отправлено на ${email}.`);
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

      return { t, language, l, tl, formError, setFormError, message, setMessage, memberRolesDraft, setMemberRolesDraft, roleUpdateInProgress, setRoleUpdateInProgress, search, setSearch, getCompanies, companies, noCardRequests, setNoCardRequests, loadNoCardRequests, filteredCompanies, noCardDrafts, setNoCardDrafts, rejectNotes, setRejectNotes, emailBusy, setEmailBusy, getNoCardDraft, handleApproveNoCardRequest, handleRejectNoCardRequest, resolveMemberRoleDraft, handleUpdateTeamMemberRole }
}

export function useAdminClientBarcodesPage(): ReturnType<typeof useAdminClientBarcodesPageState> {
  return useAdminClientBarcodesPageState()
}
