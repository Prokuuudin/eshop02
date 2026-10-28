'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

type StaffUser = {
    id: string; email: string; name?: string | null; mfaEnabled: boolean; updatedAt: string;
    platformRole: string; teamRole?: string | null; superAdmin?: boolean;
};
type RoleRequest = { id: string; targetUserId: string; requestedByUserId: string; targetEmail: string | null; requestedByEmail: string | null; expiresAt: string };
type Action =
    | { kind: 'mfa-reset'; user: StaffUser }
    | { kind: 'grant-super'; user: StaffUser }
    | { kind: 'revoke-super'; user: StaffUser }
    | { kind: 'revoke-access'; user: StaffUser }
    | { kind: 'promote'; email: string }
    | { kind: 'approve'; request: RoleRequest };

/**
 * Staff administration for Super Admins: admin promotion requests (four-eyes approval),
 * Super Admin grant/revoke, revoking staff access and resetting a colleague's 2FA.
 * The server enforces staff.manage, step-up (own password + own TOTP) and audit logging;
 * a regular admin gets 403 from the approvals listing and never sees this panel.
 */
export default function AdminStaffMfaReset({ currentUserId }: { currentUserId: string }): React.ReactElement | null {
    const { l } = useAdminLocale();
    const [staff, setStaff] = useState<StaffUser[] | null>(null);
    const [requests, setRequests] = useState<RoleRequest[]>([]);
    const [action, setAction] = useState<Action | null>(null);
    const [promoteEmail, setPromoteEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStaff = useCallback(() => {
        fetch('/api/admin/users/role-approvals', { cache: 'no-store' })
            .then(async (approvals) => {
                if (!approvals.ok) throw new Error();
                const responses = await Promise.all([
                    fetch('/api/admin/users?role=admin&take=100', { cache: 'no-store' }),
                    fetch('/api/admin/users?teamRole=manager&take=100', { cache: 'no-store' }),
                ]);
                if (responses.some((r) => !r.ok)) throw new Error();
                const lists = await Promise.all(responses.map((r) => r.json() as Promise<{ users?: StaffUser[] }>));
                const byId = new Map<string, StaffUser>();
                for (const u of lists.flatMap((list) => list.users ?? [])) byId.set(u.id, u);
                setStaff([...byId.values()]);
                setRequests(((await approvals.json()) as { requests?: RoleRequest[] }).requests ?? []);
            })
            .catch(() => setStaff(null));
    }, []);

    useEffect(loadStaff, [loadStaff, currentUserId]);

    const close = () => {
        setAction(null);
        setCurrentPassword('');
        setMfaCode('');
        setReason('');
        setError('');
    };

    const errorText = (status: number, code: string | undefined): string => {
        if (status === 429) return l('Слишком много попыток. Подождите 15 минут.', 'Too many attempts. Wait 15 minutes.', 'Pārāk daudz mēģinājumu. Uzgaidiet 15 minūtes.');
        if (status === 401) return l('Неверный пароль или код.', 'Invalid password or code.', 'Nederīga parole vai kods.');
        if (code === 'last_super_admin_protected') return l('Нельзя снять последнего Super Admin.', 'The last Super Admin cannot be removed.', 'Pēdējo Super Admin nevar noņemt.');
        if (code === 'last_admin_protected') return l('Нельзя понизить последнего администратора.', 'The last administrator cannot be demoted.', 'Pēdējo administratoru nevar pazemināt.');
        if (code === 'four_eyes_required') return l('Заявку должен подтвердить другой Super Admin.', 'Another Super Admin must approve this request.', 'Pieprasījums jāapstiprina citam Super Admin.');
        if (code === 'optimistic_conflict' || code === 'concurrent_update') return l('Данные изменились. Обновите страницу.', 'The data changed. Reload the page.', 'Dati ir mainījušies. Pārlādējiet lapu.');
        if (code === 'not_found') return l('Пользователь с таким email не найден.', 'No user with this email.', 'Lietotājs ar šādu e-pastu nav atrasts.');
        return l('Операция не выполнена. Попробуйте позже.', 'The operation failed. Try again later.', 'Darbība neizdevās. Mēģiniet vēlāk.');
    };

    const patchUser = (user: { id: string; updatedAt: string }, changes: Record<string, unknown>) => fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, expectedUpdatedAt: user.updatedAt, currentPassword, mfaCode: mfaCode.trim(), reason, ...changes }),
    });

    const findByEmail = async (email: string): Promise<StaffUser | null> => {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(email)}&take=10`, { cache: 'no-store' });
        if (!res.ok) return null;
        const { users } = await res.json() as { users?: StaffUser[] };
        return users?.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    };

    const submit = async () => {
        if (!action) return;
        setBusy(true);
        setError('');
        try {
            let res: Response;
            if (action.kind === 'mfa-reset') {
                res = await fetch(`/api/admin/users/${encodeURIComponent(action.user.id)}/mfa-reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword, mfaCode: mfaCode.trim(), reason }),
                });
            } else if (action.kind === 'approve') {
                res = await fetch('/api/admin/users/role-approvals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requestId: action.request.id, currentPassword, mfaCode: mfaCode.trim(), reason }),
                });
            } else if (action.kind === 'promote') {
                const target = await findByEmail(action.email);
                if (!target) { setError(errorText(404, 'not_found')); return; }
                res = await patchUser(target, { platformRole: 'admin' });
            } else if (action.kind === 'revoke-access') {
                res = await patchUser(action.user, action.user.platformRole === 'admin' ? { platformRole: 'customer' } : { teamRole: null });
            } else {
                res = await patchUser(action.user, { superAdmin: action.kind === 'grant-super' });
            }
            const body = await res.json().catch(() => null) as { error?: string; pendingApproval?: boolean } | null;
            if (!res.ok) {
                setError(errorText(res.status, body?.error));
                return;
            }
            close();
            setPromoteEmail('');
            setNotice(body?.pendingApproval
                ? l('Заявка создана. Её должен подтвердить второй Super Admin в течение 24 часов.', 'Request created. The second Super Admin must approve it within 24 hours.', 'Pieprasījums izveidots. Otrajam Super Admin tas jāapstiprina 24 stundu laikā.')
                : l('Готово. Сессии сотрудника завершены, изменения действуют сразу.', 'Done. The colleague’s sessions were ended; the change applies immediately.', 'Gatavs. Darbinieka sesijas ir beigtas, izmaiņas stājas spēkā uzreiz.'));
            loadStaff();
        } catch {
            setError(l('Ошибка сервера. Попробуйте позже.', 'Server error. Try again later.', 'Servera kļūda. Mēģiniet vēlāk.'));
        } finally {
            setBusy(false);
        }
    };

    if (!staff) return null;

    const roleLabel = (u: StaffUser): string => u.superAdmin
        ? 'Super Admin'
        : u.platformRole === 'admin' ? l('Администратор', 'Admin', 'Administrators') : l('Менеджер', 'Manager', 'Menedžeris');

    const startAction = (next: Action) => { close(); setNotice(''); setAction(next); };

    const stepUpForm = (
        <div className="mt-3 space-y-2">
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={l('Ваш пароль', 'Your password', 'Jūsu parole')} autoComplete="current-password" />
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)}
                placeholder={l('Ваш код из приложения', 'Your code from the app', 'Jūsu kods no lietotnes')}
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={l('Причина (минимум 5 символов)', 'Reason (at least 5 characters)', 'Iemesls (vismaz 5 rakstzīmes)')} maxLength={1000} />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2">
                <Button size="sm" onClick={() => void submit()}
                    disabled={busy || !currentPassword || mfaCode.trim().length !== 6 || reason.trim().length < 5}>
                    {l('Подтвердить', 'Confirm', 'Apstiprināt')}
                </Button>
                <Button size="sm" variant="outline" onClick={close}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
            </div>
        </div>
    );
    const isActive = (kind: Action['kind'], key: string): boolean => {
        if (!action || action.kind !== kind) return false;
        if (action.kind === 'promote') return true;
        if (action.kind === 'approve') return action.request.id === key;
        return action.user.id === key;
    };

    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">
                    {l('Сотрудники (Super Admin)', 'Staff (Super Admin)', 'Darbinieki (Super Admin)')}
                </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
                {l('Назначение и отзыв прав, Super Admin и сброс 2FA. Каждое действие подтверждается вашим паролем и кодом из приложения.', 'Grant and revoke access, Super Admin and 2FA resets. Every action is confirmed with your password and app code.', 'Tiesību piešķiršana un atsaukšana, Super Admin un 2FA atiestatīšana. Katru darbību apstiprina ar jūsu paroli un lietotnes kodu.')}
            </p>
            {notice && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

            <ul className="space-y-2">
                {staff.map((u) => {
                    const self = u.id === currentUserId;
                    return (
                        <li key={u.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{u.name || u.email}{self ? ` (${l('вы', 'you', 'jūs')})` : ''}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {u.email} · {roleLabel(u)} · {u.mfaEnabled
                                            ? l('2FA настроена', '2FA set up', '2FA iestatīta')
                                            : l('2FA ещё не настроена', '2FA not set up yet', '2FA vēl nav iestatīta')}
                                    </p>
                                </div>
                                {!self && (
                                    <div className="flex flex-wrap gap-2">
                                        {u.platformRole === 'admin' && (u.superAdmin
                                            ? <Button size="sm" variant="outline" onClick={() => startAction({ kind: 'revoke-super', user: u })}>{l('Снять Super Admin', 'Remove Super Admin', 'Noņemt Super Admin')}</Button>
                                            : <Button size="sm" variant="outline" onClick={() => startAction({ kind: 'grant-super', user: u })}>{l('Сделать Super Admin', 'Make Super Admin', 'Piešķirt Super Admin')}</Button>)}
                                        {u.mfaEnabled && <Button size="sm" variant="outline" onClick={() => startAction({ kind: 'mfa-reset', user: u })}>{l('Сбросить 2FA', 'Reset 2FA', 'Atiestatīt 2FA')}</Button>}
                                        <Button size="sm" variant="outline" onClick={() => startAction({ kind: 'revoke-access', user: u })}>{l('Отозвать доступ', 'Revoke access', 'Atsaukt piekļuvi')}</Button>
                                    </div>
                                )}
                            </div>
                            {(['grant-super', 'revoke-super', 'mfa-reset', 'revoke-access'] as const).some((k) => isActive(k, u.id)) && stepUpForm}
                        </li>
                    );
                })}
            </ul>

            <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium text-foreground">{l('Назначить администратора', 'Appoint an administrator', 'Iecelt administratoru')}</p>
                <div className="flex gap-2">
                    <Input type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} placeholder="email@example.com" />
                    <Button size="sm" variant="outline" disabled={!promoteEmail.includes('@')}
                        onClick={() => startAction({ kind: 'promote', email: promoteEmail.trim() })}>
                        {l('Создать заявку', 'Create request', 'Izveidot pieprasījumu')}
                    </Button>
                </div>
                {isActive('promote', '') && stepUpForm}
            </div>

            {requests.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-sm font-medium text-foreground">{l('Заявки на права администратора', 'Admin role requests', 'Administratora tiesību pieprasījumi')}</p>
                    <ul className="space-y-2">
                        {requests.map((r) => (
                            <li key={r.id} className="rounded-lg border border-border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                                        {r.targetEmail ?? r.targetUserId} · {l('запросил', 'requested by', 'pieprasīja')} {r.requestedByEmail ?? r.requestedByUserId}
                                    </p>
                                    {r.requestedByUserId !== currentUserId
                                        ? <Button size="sm" onClick={() => startAction({ kind: 'approve', request: r })}>{l('Подтвердить', 'Approve', 'Apstiprināt')}</Button>
                                        : <span className="text-xs text-muted-foreground">{l('ждёт второго Super Admin', 'awaiting the other Super Admin', 'gaida otru Super Admin')}</span>}
                                </div>
                                {isActive('approve', r.id) && stepUpForm}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
