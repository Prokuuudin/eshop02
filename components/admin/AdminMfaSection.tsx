'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

type Status = { enabled: boolean; enrolledAt: string | null; backupCodesRemaining: number };
type View = 'idle' | 'enrolling' | 'showing-backup-codes' | 'disabling' | 'regenerating';

type Translate = (ru: string, en: string, lv: string) => string;

// Plain-language staff guide. Setup itself happens in the mandatory sign-in step
// (LoginForm); this only explains it and the recovery options offered below.
function MfaInstructions({ l, defaultOpen }: { l: Translate; defaultOpen: boolean }): React.ReactElement {
    const steps = [
        l('Установите на телефон приложение-аутентификатор, например Google Authenticator или Microsoft Authenticator.', 'Install an authenticator app on your phone, for example Google Authenticator or Microsoft Authenticator.', 'Instalējiet tālrunī autentifikatora lietotni, piemēram, Google Authenticator vai Microsoft Authenticator.'),
        l('При первом входе после пароля откроется экран настройки защиты (если здесь защита отмечена как не настроенная, нажмите «Настроить защиту»). Отсканируйте QR-код телефоном.', 'At your first sign-in, a protection setup screen opens after the password (if protection is shown here as not set up, press “Set up protection”). Scan the QR code with your phone.', 'Pirmajā pieslēgšanās reizē pēc paroles atvērsies aizsardzības iestatīšanas ekrāns (ja šeit aizsardzība norādīta kā neiestatīta, nospiediet «Iestatīt aizsardzību»). Noskenējiet QR kodu ar tālruni.'),
        l('Введите шестизначный код из приложения.', 'Enter the six-digit code from the app.', 'Ievadiet sešu ciparu kodu no lietotnes.'),
        l('Сохраните резервные коды в безопасном месте. Они понадобятся, если телефон будет потерян.', 'Keep the backup codes in a safe place. You will need them if you lose your phone.', 'Saglabājiet rezerves kodus drošā vietā. Tie būs nepieciešami, ja tālrunis tiks pazaudēts.'),
        l('При следующих входах вводите код из приложения после пароля.', 'At later sign-ins, enter the code from the app after your password.', 'Turpmāk pēc paroles ievadiet kodu no lietotnes.'),
    ];
    const notes = [
        l('Код в приложении меняется автоматически каждые 30 секунд — вводите тот, что виден сейчас.', 'The code in the app changes automatically every 30 seconds — enter the one shown now.', 'Kods lietotnē mainās automātiski ik pēc 30 sekundēm — ievadiet to, kas redzams pašlaik.'),
        l('Каждый резервный код срабатывает только один раз. Когда они заканчиваются, создайте новые кнопкой «Новые резервные коды».', 'Each backup code works only once. When they run low, create new ones with “New backup codes”.', 'Katrs rezerves kods darbojas tikai vienu reizi. Kad tie beidzas, izveidojiet jaunus ar pogu «Jauni rezerves kodi».'),
        l('Новый телефон: пока старый ещё работает, нажмите «Сменить устройство» и при следующем входе настройте защиту заново.', 'New phone: while the old one still works, press “Change device” and set up protection again at the next sign-in.', 'Jauns tālrunis: kamēr vecais vēl darbojas, nospiediet «Mainīt ierīci» un nākamajā pieslēgšanās reizē iestatiet aizsardzību no jauna.'),
        l('Потеряли и телефон, и резервные коды? Обратитесь к другому администратору — он сбросит защиту, и при следующем входе вы настроите её заново.', 'Lost both your phone and your backup codes? Contact another administrator — they will reset the protection, and you will set it up again at the next sign-in.', 'Pazaudējāt gan tālruni, gan rezerves kodus? Sazinieties ar citu administratoru — viņš atiestatīs aizsardzību, un nākamajā pieslēgšanās reizē jūs to iestatīsiet no jauna.'),
    ];
    return (
        <details open={defaultOpen} className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">{l('Как это работает', 'How it works', 'Kā tas darbojas')}</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                {steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
                {notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
        </details>
    );
}

export default function AdminMfaSection(): React.ReactElement {
    const { l, locale } = useAdminLocale();
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
            setError(l('Не удалось начать настройку. Попробуйте ещё раз.', 'Setup could not be started. Try again.', 'Neizdevās sākt iestatīšanu. Mēģiniet vēlreiz.'));
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
                setError(l('Неверный код. Проверьте приложение-аутентификатор и попробуйте снова.', 'Invalid code. Check your authenticator app and try again.', 'Nederīgs kods. Pārbaudiet autentifikatora lietotni un mēģiniet vēlreiz.'));
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError(l('Ошибка сервера. Попробуйте позже.', 'Server error. Try again later.', 'Servera kļūda. Mēģiniet vēlāk.'));
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
                setError(l('Неверный пароль или код.', 'Invalid password or code.', 'Nederīga parole vai kods.'));
                return;
            }
            // MFA is mandatory: the server revoked every session, so the next login
            // walks through enrollment with the new device.
            // Same staff sign-in entry the admin layout uses for admins and managers.
            window.location.assign('/auth/login?admin=1&redirect=/account');
        } catch {
            setError(l('Ошибка сервера. Попробуйте позже.', 'Server error. Try again later.', 'Servera kļūda. Mēģiniet vēlāk.'));
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
                setError(l('Неверный код.', 'Invalid code.', 'Nederīgs kods.'));
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError(l('Ошибка сервера. Попробуйте позже.', 'Server error. Try again later.', 'Servera kļūda. Mēģiniet vēlāk.'));
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
                    <h2 className="text-sm font-semibold text-foreground">{l('Двухфакторная аутентификация', 'Two-factor authentication', 'Divfaktoru autentifikācija')}</h2>
                </div>
                <div className="space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400">
                        {l('Не удалось загрузить настройки 2FA. Попробуйте обновить страницу или повторить позже.', 'Could not load 2FA settings. Refresh the page or try again later.', 'Neizdevās ielādēt 2FA iestatījumus. Atsvaidziniet lapu vai mēģiniet vēlāk.')}
                    </p>
                    <Button size="sm" onClick={() => void loadStatus()}>
                        {l('Попробовать снова', 'Try again', 'Mēģināt vēlreiz')}
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
                <h2 className="text-sm font-semibold text-foreground">{l('Двухфакторная защита входа', 'Two-factor sign-in protection', 'Divfaktoru pieslēgšanās aizsardzība')}</h2>
                <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${status!.enabled
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}
                >
                    {status!.enabled ? l('Включена', 'Enabled', 'Ieslēgta') : l('Не настроена', 'Not set up', 'Nav iestatīta')}
                </span>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
                {l('Для защиты административной панели нужна дополнительная проверка входа: после пароля вы вводите код из приложения на телефоне. Даже если кто-то узнает ваш пароль, без телефона он не войдёт.', 'The administration panel requires an extra sign-in check: after your password you enter a code from an app on your phone. Even if someone learns your password, they cannot sign in without your phone.', 'Administrācijas paneļa aizsardzībai nepieciešama papildu pieslēgšanās pārbaude: pēc paroles jāievada kods no tālruņa lietotnes. Pat ja kāds uzzinās jūsu paroli, bez tālruņa viņš nevarēs pieslēgties.')}
            </p>

            {view === 'idle' && !status!.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {l('Не настроена. Для сотрудников защита обязательна — настройте её сейчас.', 'Not set up. Protection is required for staff — set it up now.', 'Nav iestatīta. Darbiniekiem aizsardzība ir obligāta — iestatiet to tūlīt.')}
                    </p>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <Button size="sm" onClick={() => void startEnroll()} disabled={busy}>
                        {l('Настроить защиту', 'Set up protection', 'Iestatīt aizsardzību')}
                    </Button>
                </div>
            )}

            {view === 'idle' && status!.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {l('Включена', 'Enabled', 'Ieslēgta')}{status!.enrolledAt ? ` ${l('с', 'since', 'kopš')} ${new Date(status!.enrolledAt).toLocaleDateString(locale)}` : ''}.
                        {l('Резервных кодов осталось:', 'Backup codes remaining:', 'Atlikušie rezerves kodi:')} {status!.backupCodesRemaining}.
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setView('regenerating')}>
                            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                            {l('Новые резервные коды', 'New backup codes', 'Jauni rezerves kodi')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setView('disabling')}>
                            {l('Сменить устройство', 'Change device', 'Mainīt ierīci')}
                        </Button>
                    </div>
                </div>
            )}

            {view === 'enrolling' && qrCodeDataUrl && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {l('Отсканируйте QR-код в Google Authenticator / Microsoft Authenticator и введите текущий код.', 'Scan the QR code in Google Authenticator or Microsoft Authenticator and enter the current code.', 'Noskenējiet QR kodu lietotnē Google Authenticator vai Microsoft Authenticator un ievadiet pašreizējo kodu.')}
                    </p>
                    <Image src={qrCodeDataUrl} alt={l('QR-код для 2FA', 'QR code for 2FA', '2FA QR kods')} width={200} height={200} unoptimized />
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
                            {l('Подтвердить', 'Confirm', 'Apstiprināt')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                    </div>
                </div>
            )}

            {view === 'showing-backup-codes' && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                        {l('Сохраните эти коды — они больше не будут показаны. Каждый работает один раз, если приложение-аутентификатор недоступно.', 'Save these codes — they will not be shown again. Each can be used once if the authenticator app is unavailable.', 'Saglabājiet šos kodus — tie vairs netiks parādīti. Katru var izmantot vienu reizi, ja autentifikatora lietotne nav pieejama.')}
                    </p>
                    <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">
                        {backupCodes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <Button size="sm" onClick={reset}>{l('Готово', 'Done', 'Gatavs')}</Button>
                </div>
            )}

            {view === 'disabling' && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {l('Текущая настройка будет удалена, все сеансы завершены. При следующем входе нужно будет отсканировать новый QR-код.', 'The current setup will be removed and all sessions ended. You will scan a new QR code at the next sign-in.', 'Pašreizējais iestatījums tiks dzēsts un visas sesijas beigtas. Nākamajā pieslēgšanās reizē būs jānoskenē jauns QR kods.')}
                    </p>
                    <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={l('Текущий пароль', 'Current password', 'Pašreizējā parole')}
                        autoComplete="current-password"
                    />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={l('Код из приложения', 'Code from the app', 'Kods no lietotnes')}
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
                            {l('Сбросить и выйти', 'Reset and sign out', 'Atiestatīt un iziet')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                    </div>
                </div>
            )}

            {view === 'regenerating' && (
                <div className="space-y-3">
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={l('Код из приложения', 'Code from the app', 'Kods no lietotnes')}
                        maxLength={6}
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void regenerateBackupCodes()} disabled={busy || code.length !== 6}>
                            {l('Перегенерировать', 'Regenerate', 'Ģenerēt no jauna')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                    </div>
                </div>
            )}

            {view === 'idle' && <MfaInstructions l={l} defaultOpen={!status!.enabled} />}
        </div>
    );
}
