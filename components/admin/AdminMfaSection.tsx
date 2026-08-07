'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = { enabled: boolean; enrolledAt: string | null; backupCodesRemaining: number };
type View = 'idle' | 'enrolling' | 'showing-backup-codes' | 'disabling' | 'regenerating';

export default function AdminMfaSection(): React.ReactElement {
    const [status, setStatus] = useState<Status | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [view, setView] = useState<View>('idle');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStatus = () => {
        fetch('/api/user/mfa/status')
            .then((r) => {
                // Reset here (inside the async chain, not synchronously in the function
                // body) so an effect calling this directly never sets state synchronously
                // during its own execution — same net timing, just deferred a tick.
                setLoadError(false);
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then((json: Status) => setStatus(json))
            .catch(() => setLoadError(true));
    };

    useEffect(loadStatus, []);

    const reset = () => {
        setView('idle');
        setCode('');
        setCurrentPassword('');
        setError('');
        setQrCodeDataUrl(null);
        setBackupCodes([]);
    };

    const startEnroll = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/setup', { method: 'POST' });
            if (!res.ok) throw new Error();
            const json = await res.json() as { qrCodeDataUrl: string };
            setQrCodeDataUrl(json.qrCodeDataUrl);
            setView('enrolling');
        } catch {
            setError('Не удалось начать настройку. Попробуйте ещё раз.');
        } finally {
            setBusy(false);
        }
    };

    const confirmEnroll = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                setError('Неверный код. Проверьте приложение-аутентификатор и попробуйте снова.');
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, code }),
            });
            if (!res.ok) {
                setError('Неверный пароль или код.');
                return;
            }
            reset();
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    const regenerateBackupCodes = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/backup-codes/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                setError('Неверный код.');
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    if (!status && !loadError) return <></>;

    if (loadError && !status) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                    <ShieldOff className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <h2 className="text-sm font-semibold text-foreground">Двухфакторная аутентификация</h2>
                </div>
                <div className="space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        Не удалось загрузить настройки 2FA. Попробуйте обновить страницу или повторить позже.
                    </p>
                    <Button size="sm" onClick={() => void loadStatus()}>
                        Попробовать снова
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                {status!.enabled ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                    <ShieldOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                )}
                <h2 className="text-sm font-semibold text-foreground">Двухфакторная аутентификация</h2>
            </div>

            {view === 'idle' && !status!.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Не включена. Рекомендуем включить, чтобы пароль был не единственной защитой доступа к админке.
                    </p>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <Button size="sm" onClick={() => void startEnroll()} disabled={busy}>
                        Включить
                    </Button>
                </div>
            )}

            {view === 'idle' && status!.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Включена{status!.enrolledAt ? ` с ${new Date(status!.enrolledAt).toLocaleDateString('ru-RU')}` : ''}.
                        Резервных кодов осталось: {status!.backupCodesRemaining}.
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setView('regenerating')}>
                            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                            Новые резервные коды
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setView('disabling')}>
                            Отключить
                        </Button>
                    </div>
                </div>
            )}

            {view === 'enrolling' && qrCodeDataUrl && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Отсканируйте QR-код в Google Authenticator / Microsoft Authenticator и введите текущий код.
                    </p>
                    <Image src={qrCodeDataUrl} alt="QR-код для 2FA" width={200} height={200} unoptimized />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="max-w-[160px]"
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void confirmEnroll()} disabled={busy || code.length !== 6}>
                            Подтвердить
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}

            {view === 'showing-backup-codes' && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                        Сохраните эти коды — они больше не будут показаны. Каждый работает один раз, если приложение-аутентификатор недоступно.
                    </p>
                    <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">
                        {backupCodes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <Button size="sm" onClick={reset}>Готово</Button>
                </div>
            )}

            {view === 'disabling' && (
                <div className="space-y-3">
                    <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Текущий пароль"
                        autoComplete="current-password"
                    />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Код из приложения"
                        maxLength={10}
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void disable()}
                            disabled={busy || !currentPassword || code.length < 6}
                        >
                            Отключить 2FA
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}

            {view === 'regenerating' && (
                <div className="space-y-3">
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Код из приложения"
                        maxLength={6}
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void regenerateBackupCodes()} disabled={busy || code.length !== 6}>
                            Перегенерировать
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
