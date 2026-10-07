'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

type StaffUser = { id: string; email: string; name?: string | null; mfaEnabled: boolean };

/**
 * Lets a full admin reset two-factor authentication for a colleague who lost their phone.
 * The server enforces permission, step-up (own password + own TOTP) and audit logging;
 * this panel is only the form.
 */
export default function AdminStaffMfaReset({ currentUserId }: { currentUserId: string }): React.ReactElement | null {
    const { l } = useAdminLocale();
    const [staff, setStaff] = useState<StaffUser[] | null>(null);
    const [targetId, setTargetId] = useState<string | null>(null);
    const [currentPassword, setCurrentPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStaff = () => {
        Promise.all([
            fetch('/api/admin/users?role=admin&take=100', { cache: 'no-store' }),
            fetch('/api/admin/users?teamRole=manager&take=100', { cache: 'no-store' }),
        ])
            .then(async (responses) => {
                if (responses.some((r) => !r.ok)) throw new Error();
                const lists = await Promise.all(responses.map((r) => r.json() as Promise<{ users?: StaffUser[] }>));
                const byId = new Map<string, StaffUser>();
                for (const u of lists.flatMap((list) => list.users ?? [])) byId.set(u.id, u);
                setStaff([...byId.values()].filter((u) => u.id !== currentUserId));
            })
            .catch(() => setStaff(null));
    };

    useEffect(loadStaff, [currentUserId]);

    const close = () => {
        setTargetId(null);
        setCurrentPassword('');
        setMfaCode('');
        setReason('');
        setError('');
    };

    const submit = async () => {
        if (!targetId) return;
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(targetId)}/mfa-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, mfaCode: mfaCode.trim(), reason }),
            });
            if (!res.ok) {
                setError(res.status === 429
                    ? l('Слишком много попыток. Подождите 15 минут.', 'Too many attempts. Wait 15 minutes.', 'Pārāk daudz mēģinājumu. Uzgaidiet 15 minūtes.')
                    : res.status === 401
                        ? l('Неверный пароль или код.', 'Invalid password or code.', 'Nederīga parole vai kods.')
                        : l('Не удалось сбросить. Попробуйте позже.', 'Reset failed. Try again later.', 'Neizdevās atiestatīt. Mēģiniet vēlāk.'));
                return;
            }
            const email = staff?.find((u) => u.id === targetId)?.email ?? '';
            close();
            setNotice(l(
                `2FA для ${email} сброшена. При следующем входе сотрудник настроит новое устройство.`,
                `2FA for ${email} was reset. They will set up a new device at their next sign-in.`,
                `2FA lietotājam ${email} atiestatīta. Nākamajā pieslēgšanās reizē tiks iestatīta jauna ierīce.`,
            ));
            loadStaff();
        } catch {
            setError(l('Ошибка сервера. Попробуйте позже.', 'Server error. Try again later.', 'Servera kļūda. Mēģiniet vēlāk.'));
        } finally {
            setBusy(false);
        }
    };

    // Managers get 403 from the staff listing — the panel is only for full admins.
    if (!staff) return null;

    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">
                    {l('2FA сотрудников', 'Staff 2FA', 'Darbinieku 2FA')}
                </h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
                {l('Если сотрудник потерял телефон и коды восстановления, сбросьте его 2FA — при следующем входе он настроит новое устройство.', 'If a colleague lost their phone and recovery codes, reset their 2FA — they will set up a new device at the next sign-in.', 'Ja darbinieks ir pazaudējis tālruni un atkopšanas kodus, atiestatiet 2FA — nākamajā pieslēgšanās reizē tiks iestatīta jauna ierīce.')}
            </p>
            {notice && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
            {staff.length === 0 ? (
                <p className="text-sm text-muted-foreground">{l('Других сотрудников нет.', 'No other staff.', 'Citu darbinieku nav.')}</p>
            ) : (
                <ul className="space-y-2">
                    {staff.map((u) => (
                        <li key={u.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{u.name || u.email}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {u.email} · {u.mfaEnabled
                                            ? l('2FA настроена', '2FA set up', '2FA iestatīta')
                                            : l('2FA ещё не настроена', '2FA not set up yet', '2FA vēl nav iestatīta')}
                                    </p>
                                </div>
                                {u.mfaEnabled && targetId !== u.id && (
                                    <Button size="sm" variant="outline" onClick={() => { close(); setNotice(''); setTargetId(u.id); }}>
                                        {l('Сбросить 2FA', 'Reset 2FA', 'Atiestatīt 2FA')}
                                    </Button>
                                )}
                            </div>
                            {targetId === u.id && (
                                <div className="mt-3 space-y-2">
                                    <Input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder={l('Ваш пароль', 'Your password', 'Jūsu parole')}
                                        autoComplete="current-password"
                                    />
                                    <Input
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        placeholder={l('Ваш код из приложения', 'Your code from the app', 'Jūsu kods no lietotnes')}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                    />
                                    <Input
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder={l('Причина (например, потерян телефон)', 'Reason (e.g. lost phone)', 'Iemesls (piem., pazaudēts tālrunis)')}
                                        maxLength={1000}
                                    />
                                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => void submit()}
                                            disabled={busy || !currentPassword || mfaCode.trim().length !== 6 || reason.trim().length < 5}
                                        >
                                            {l('Сбросить', 'Reset', 'Atiestatīt')}
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={close}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
