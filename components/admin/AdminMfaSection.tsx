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
// (LoginForm); this only explains it and the recovery options that exist in the app:
// backup-code sign-in, "Change device", "New backup codes" and a reset by a shop administrator.
function MfaInstructions({ l, defaultOpen }: { l: Translate; defaultOpen: boolean }): React.ReactElement {
    const topics: Array<{ q: string; a: string }> = [
        {
            q: l('Как проходит обычный вход', 'How a normal sign-in works', 'Kā notiek parasta pieslēgšanās'),
            a: l('Введите email и пароль, затем откройте приложение-аутентификатор на телефоне и введите текущий шестизначный код. Код меняется автоматически каждые 30 секунд — вводите тот, что виден сейчас.', 'Enter your email and password, then open the authenticator app on your phone and enter the current six-digit code. The code changes automatically every 30 seconds — enter the one shown now.', 'Ievadiet e-pastu un paroli, tad atveriet tālrunī autentifikatora lietotni un ievadiet pašreizējo sešu ciparu kodu. Kods mainās automātiski ik pēc 30 sekundēm — ievadiet to, kas redzams pašlaik.'),
        },
        {
            q: l('Зачем нужны резервные коды', 'Why you need backup codes', 'Kāpēc vajadzīgi rezerves kodi'),
            a: l('Они позволяют войти, когда телефона с приложением нет под рукой: он потерян, сломан или разряжен. При настройке выдаются 8 кодов, сколько осталось — видно выше.', 'They let you sign in when the phone with the app is not available: lost, broken or out of battery. You get 8 codes at setup; how many are left is shown above.', 'Tie ļauj pieslēgties, ja tālrunis ar lietotni nav pieejams: pazaudēts, salūzis vai izlādējies. Iestatot tiek izsniegti 8 kodi; cik palicis, redzams augstāk.'),
        },
        {
            q: l('Как войти по резервному коду', 'How to sign in with a backup code', 'Kā pieslēgties ar rezerves kodu'),
            a: l('На экране входа после пароля нажмите «Использовать резервный код» и введите один из сохранённых кодов (10 символов: цифры и латинские буквы a–f). Вернуться к коду из приложения можно кнопкой «Ввести код из приложения».', 'On the sign-in screen, after your password, press “Use a backup code” and enter one of your saved codes (10 characters: digits and letters a–f). To go back to the app code, press “Enter the code from the app”.', 'Pieslēgšanās ekrānā pēc paroles nospiediet «Izmantot rezerves kodu» un ievadiet vienu no saglabātajiem kodiem (10 rakstzīmes: cipari un latīņu burti a–f). Lai atgrieztos pie lietotnes koda, nospiediet «Ievadīt kodu no lietotnes».'),
        },
        {
            q: l('Почему каждый код одноразовый', 'Why each code works only once', 'Kāpēc katrs kods darbojas tikai vienu reizi'),
            a: l('Использованный код сразу перестаёт действовать. Даже если кто-то увидит его, повторно войти с ним не получится.', 'A used code stops working immediately. Even if someone sees it, it cannot be used to sign in again.', 'Izmantots kods uzreiz vairs nedarbojas. Pat ja kāds to redzēs, ar to vairs nevarēs pieslēgties.'),
        },
        {
            q: l('Как хранить резервные коды', 'How to keep backup codes safe', 'Kā droši glabāt rezerves kodus'),
            a: l('Запишите их на бумаге и храните в надёжном месте или сохраните в менеджере паролей. Не храните их на том же телефоне, что и приложение, не отправляйте по почте или в мессенджерах и никому не сообщайте.', 'Write them on paper and keep them somewhere safe, or store them in a password manager. Do not keep them on the same phone as the app, do not send them by email or messenger, and never share them.', 'Pierakstiet tos uz papīra un glabājiet drošā vietā vai saglabājiet paroļu pārvaldniekā. Neglabājiet tos tajā pašā tālrunī, kurā ir lietotne, nesūtiet pa e-pastu vai ziņapmaiņas lietotnēm un nevienam neizpaudiet.'),
        },
        {
            q: l('Меняю телефон', 'I am changing my phone', 'Mainu tālruni'),
            a: l('Пока старый телефон ещё работает, нажмите выше «Сменить устройство» и подтвердите паролем и кодом из приложения. Все сеансы завершатся, а при следующем входе вы отсканируете новый QR-код новым телефоном.', 'While the old phone still works, press “Change device” above and confirm with your password and the app code. All sessions end, and at the next sign-in you scan a new QR code with the new phone.', 'Kamēr vecais tālrunis vēl darbojas, nospiediet augstāk «Mainīt ierīci» un apstipriniet ar paroli un lietotnes kodu. Visas sesijas beigsies, un nākamajā pieslēgšanās reizē jūs noskenēsiet jaunu QR kodu ar jauno tālruni.'),
        },
        {
            q: l('Потерял телефон', 'I lost my phone', 'Pazaudēju tālruni'),
            a: l('Войдите по резервному коду. Затем нажмите «Сменить устройство» и подтвердите паролем и ещё одним резервным кодом. При следующем входе настройте защиту на новом телефоне.', 'Sign in with a backup code. Then press “Change device” and confirm with your password and another backup code. At the next sign-in, set up protection on your new phone.', 'Pieslēdzieties ar rezerves kodu. Tad nospiediet «Mainīt ierīci» un apstipriniet ar paroli un vēl vienu rezerves kodu. Nākamajā pieslēgšanās reizē iestatiet aizsardzību jaunajā tālrunī.'),
        },
        {
            q: l('Резервные коды закончились', 'I have run out of backup codes', 'Rezerves kodi ir beigušies'),
            a: l('Если телефон с приложением при вас, нажмите «Новые резервные коды» и введите код из приложения. Старые коды перестанут действовать, сохраните новые. Если нет ни телефона, ни кодов — смотрите следующий пункт.', 'If you have the phone with the app, press “New backup codes” and enter the app code. The old codes stop working; save the new ones. If you have neither the phone nor any codes, see the next item.', 'Ja tālrunis ar lietotni ir pie jums, nospiediet «Jauni rezerves kodi» un ievadiet lietotnes kodu. Vecie kodi vairs nedarbosies; saglabājiet jaunos. Ja nav ne tālruņa, ne kodu — skatiet nākamo punktu.'),
        },
        {
            q: l('Нет ни телефона, ни резервных кодов', 'I have neither the phone nor backup codes', 'Nav ne tālruņa, ne rezerves kodu'),
            a: l('Самостоятельно восстановить доступ нельзя: одного email и пароля недостаточно. Обратитесь к другому администратору магазина — он сбросит защиту вашей учётной записи в своём личном кабинете. При следующем входе вы настроите её заново.', 'You cannot restore access on your own: an email and password are not enough. Contact another shop administrator — they will reset the protection of your account from their own account page. At the next sign-in you set it up again.', 'Patstāvīgi atjaunot piekļuvi nevar: ar e-pastu un paroli nepietiek. Sazinieties ar citu veikala administratoru — viņš atiestatīs jūsu konta aizsardzību savā kontā. Nākamajā pieslēgšanās reizē jūs to iestatīsiet no jauna.'),
        },
    ];
    return (
        <details open={defaultOpen} className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">
                {l('Как работает двухфакторная аутентификация', 'How two-factor authentication works', 'Kā darbojas divfaktoru autentifikācija')}
            </summary>
            <div className="mt-3 divide-y divide-border">
                {topics.map((topic) => (
                    <details key={topic.q} className="py-2">
                        <summary className="cursor-pointer text-foreground">{topic.q}</summary>
                        <p className="mt-1.5 text-muted-foreground">{topic.a}</p>
                    </details>
                ))}
            </div>
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
                    {/* The server accepts the app code or an unused backup code here (lost-phone case). */}
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder={l('Код из приложения или резервный код', 'App code or a backup code', 'Lietotnes kods vai rezerves kods')}
                        maxLength={16}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
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
