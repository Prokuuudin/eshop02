'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import type { GrinsPreviewResponse } from '@/app/api/admin/grins-import/preview/route';
import type { GrinsImportHistoryRow } from '@/app/api/admin/grins-import/history/route';
import type { Localize } from './import-config';

const MAX_BYTES = 20 * 1024 * 1024;

type ApplyResponse = {
    status?: 'completed' | 'failed' | 'skipped';
    runId?: string | null;
    productsSynced?: number;
    errorCount?: number;
    error?: string;
    hard?: string[];
};

function errorMessage(code: string, l: Localize): string {
    const messages: Record<string, [string, string, string]> = {
        maintenance_required: ['Применение разрешено только в окне обслуживания с закрытым оформлением заказов.', 'Apply requires a maintenance window with checkout closed.', 'Piemērošanai nepieciešams apkopes logs ar slēgtu pasūtījumu noformēšanu.'],
        preview_mode_mismatch: ['Проверка относится к старому режиму. Проверьте файл заново.', 'The preview uses an old mode. Check the file again.', 'Priekšskatījums izmanto veco režīmu. Pārbaudiet failu vēlreiz.'],
        already_applied: ['Этот XML уже применён. Проверьте исходный запуск в журнале.', 'This XML was already applied. Check the original run in the log.', 'Šis XML jau ir piemērots. Pārbaudiet sākotnējo palaišanu žurnālā.'],
        unauthorized: ['Сессия истекла. Войдите снова.', 'Session expired. Sign in again.', 'Sesija beigusies. Piesakieties vēlreiz.'],
        forbidden: ['Нет прав на обновление цен.', 'You do not have permission to update prices.', 'Jums nav tiesību atjaunināt cenas.'],
        file_required: ['Выберите XML-файл.', 'Choose an XML file.', 'Izvēlieties XML failu.'],
        empty_file: ['Файл пустой.', 'The file is empty.', 'Fails ir tukšs.'],
        file_too_large: ['Файл больше 20 МБ.', 'The file is larger than 20 MB.', 'Fails ir lielāks par 20 MB.'],
        not_xml_file: ['Нужен файл .xml (export.xml из GrinS).', 'An .xml file is required (export.xml from GrinS).', 'Nepieciešams .xml fails (export.xml no GrinS).'],
        invalid_encoding: ['Файл не в кодировке UTF-8. Загрузите export.xml из GrinS без изменений.', 'The file is not UTF-8. Upload the unmodified GrinS export.xml.', 'Fails nav UTF-8. Augšupielādējiet nemainītu GrinS export.xml.'],
        forbidden_xml_construct: ['Файл содержит запрещённые XML-конструкции (DOCTYPE/ENTITY).', 'The file contains forbidden XML constructs (DOCTYPE/ENTITY).', 'Failā ir aizliegtas XML konstrukcijas (DOCTYPE/ENTITY).'],
        preview_failed: ['Не удалось проверить файл. Повторите позже.', 'The file could not be checked. Try again later.', 'Failu neizdevās pārbaudīt. Mēģiniet vēlāk.'],
        preview_not_found: ['Проверка не найдена или уже применена. Загрузите файл заново.', 'Preview not found or already applied. Upload the file again.', 'Priekšskatījums nav atrasts vai jau piemērots. Augšupielādējiet failu vēlreiz.'],
        preview_mismatch: ['Проверка заменена более новой загрузкой. Загрузите файл заново.', 'The preview was replaced by a newer upload. Upload the file again.', 'Priekšskatījumu aizstāja jaunāka augšupielāde. Augšupielādējiet failu vēlreiz.'],
        preview_expired: ['Проверка устарела (30 минут). Загрузите файл заново.', 'The preview expired (30 minutes). Upload the file again.', 'Priekšskatījums novecojis (30 minūtes). Augšupielādējiet failu vēlreiz.'],
        content_mismatch: ['Содержимое не совпадает с проверенным файлом. Каталог не изменён.', 'Content does not match the checked file. The catalog was not changed.', 'Saturs nesakrīt ar pārbaudīto failu. Katalogs nav mainīts.'],
        sync_running: ['Сейчас идёт другая синхронизация. Повторите через несколько минут.', 'Another sync is running. Try again in a few minutes.', 'Notiek cita sinhronizācija. Mēģiniet pēc dažām minūtēm.'],
        preflight_failed: ['Повторная проверка перед применением не пройдена. Каталог не изменён.', 'The re-check before applying failed. The catalog was not changed.', 'Atkārtotā pārbaude pirms piemērošanas neizdevās. Katalogs nav mainīts.'],
        backup_failed: ['Не удалось создать резервную копию. Каталог не изменён.', 'The backup could not be created. The catalog was not changed.', 'Neizdevās izveidot rezerves kopiju. Katalogs nav mainīts.'],
        skipped: ['Другая синхронизация начала работу раньше. Каталог этим запуском не изменён. Загрузите файл заново.', 'Another sync started first. This run changed nothing. Upload the file again.', 'Cita sinhronizācija sākās agrāk. Šī palaišana neko nemainīja. Augšupielādējiet failu vēlreiz.'],
        failed: ['Ошибка применения. Не повторяйте операцию до проверки её исхода в журнале.', 'Apply failed. Do not retry until its outcome is verified in the log.', 'Piemērošana neizdevās. Neatkārtojiet darbību, kamēr tās iznākums nav pārbaudīts žurnālā.'],
    };
    const m = messages[code];
    return m ? l(...m) : l('Неизвестная ошибка: ', 'Unknown error: ', 'Nezināma kļūda: ') + code;
}

export function GrinsImportSection({ l }: { l: Localize }): React.ReactElement {
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [busy, setBusy] = React.useState<'preview' | 'apply' | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [preview, setPreview] = React.useState<GrinsPreviewResponse | null>(null);
    const [confirmed, setConfirmed] = React.useState(false);
    const [applied, setApplied] = React.useState<ApplyResponse | null>(null);
    const [history, setHistory] = React.useState<GrinsImportHistoryRow[]>([]);

    const loadHistory = React.useCallback(async () => {
        try {
            const res = await fetch('/api/admin/grins-import/history', { cache: 'no-store' });
            if (res.ok) setHistory(((await res.json()) as { runs: GrinsImportHistoryRow[] }).runs);
        } catch { /* history is informational */ }
    }, []);
    React.useEffect(() => { void loadHistory(); }, [loadHistory]);

    const reset = () => {
        setPreview(null); setConfirmed(false); setApplied(null); setError(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const onPreview = async () => {
        const file = fileRef.current?.files?.[0];
        setError(null); setPreview(null); setApplied(null); setConfirmed(false);
        if (!file) { setError(errorMessage('file_required', l)); return; }
        if (file.size > MAX_BYTES) { setError(errorMessage('file_too_large', l)); return; }
        setBusy('preview');
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/admin/grins-import/preview', { method: 'POST', body: form });
            const data = (await res.json()) as GrinsPreviewResponse & { error?: string };
            if (!res.ok) setError(errorMessage(data.error ?? 'preview_failed', l));
            else setPreview(data);
        } catch {
            setError(errorMessage('preview_failed', l));
        } finally {
            setBusy(null);
        }
    };

    const onApply = async () => {
        if (!preview?.previewId) return;
        setBusy('apply'); setError(null);
        try {
            const res = await fetch('/api/admin/grins-import/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ previewId: preview.previewId, sha256: preview.sha256, mode: 'prices-only' }),
            });
            const data = (await res.json()) as ApplyResponse;
            setApplied(data);
            if (data.status === 'completed') setPreview(null);
            else setError(errorMessage(data.error ?? data.status ?? 'failed', l));
        } catch {
            // The server may still be applying: the log below is the source of truth.
            setError(l(
                'Связь прервалась. Обновление могло продолжиться на сервере — проверьте журнал ниже через 1–2 минуты, прежде чем повторять.',
                'The connection dropped. The update may still be running on the server — check the log below in 1–2 minutes before retrying.',
                'Savienojums pārtrūka. Atjaunināšana serverī var turpināties — pārbaudiet žurnālu pēc 1–2 minūtēm, pirms mēģināt vēlreiz.'
            ));
        } finally {
            setBusy(null);
            void loadHistory();
        }
    };

    const s = preview?.summary;
    const stat = (label: string, value: number, tone: 'neutral' | 'warn' | 'bad' = 'neutral') => (
        <div className={`rounded-md border px-3 py-2 ${tone === 'bad' && value > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : tone === 'warn' && value > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
        </div>
    );

    return (
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
            <div>
                <h2 className="text-base font-semibold text-foreground">
                    {l('Импорт только цен из GrinS', 'Prices-only import from GrinS', 'Tikai cenu imports no GrinS')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {l(
                        'Загрузите export.xml из GrinS. Обновляются цены price2 уже связанных товаров. Остатки, резервы и складские данные ERP не изменятся. Новые товары не создаются.',
                        'Upload export.xml from GrinS. Linked products receive price2 updates. Stock, reservations and ERP warehouse data stay unchanged. No products are created.',
                        'Augšupielādējiet export.xml no GrinS. Saistītajiem produktiem atjaunina price2 cenas. Atlikumi, rezervācijas un ERP noliktavu dati nemainās. Jauni produkti netiek izveidoti.'
                    )}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="text-sm" disabled={busy !== null} onChange={() => { setPreview(null); setApplied(null); setError(null); setConfirmed(false); }} />
                <Button type="button" onClick={onPreview} disabled={busy !== null}>
                    {busy === 'preview' ? l('Проверка…', 'Checking…', 'Pārbauda…') : l('Проверить файл', 'Check file', 'Pārbaudīt failu')}
                </Button>
                {(preview || applied) && (
                    <Button type="button" variant="outline" onClick={reset} disabled={busy !== null}>{l('Сбросить', 'Reset', 'Atiestatīt')}</Button>
                )}
            </div>

            {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

            {applied?.status === 'completed' && (
                <div role="status" className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-300">
                    {l('Обновление завершено. Обработано товаров: ', 'Update completed. Products processed: ', 'Atjaunināšana pabeigta. Apstrādāti produkti: ')}{applied.productsSynced ?? 0}. {l('Запуск: ', 'Run: ', 'Palaišana: ')}<code>{applied.runId}</code>
                </div>
            )}

            {preview && s && (
                <div className="space-y-4">
                    <div className="text-xs text-muted-foreground break-all">
                        {preview.fileName} · {(preview.sizeBytes / 1024 / 1024).toFixed(2)} MB · SHA-256 {preview.sha256}
                        <br />
                        {l('Время выгрузки в файле не указано — убедитесь, что файл свежий.', 'The file has no export timestamp — make sure it is fresh.', 'Failā nav eksporta laika — pārliecinieties, ka fails ir svaigs.')}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {stat(l('Записей в файле', 'Rows in file', 'Ieraksti failā'), s.rows)}
                        {stat(l('Сопоставлено', 'Matched', 'Sasaistīti'), s.matched)}
                        {stat(l('Не сопоставлено (пропуск)', 'Unmatched (skipped)', 'Nesasaistīti (izlaisti)'), s.unlinked, 'warn')}
                        {stat(l('Изменится цен', 'Price changes', 'Cenu izmaiņas'), s.priceChanges, 'warn')}
                        {stat(l('Цена price2 = 0 (цена сохранится)', 'price2 = 0 (price kept)', 'price2 = 0 (cena saglabāsies)'), s.priceZero, 'warn')}
                        {stat(l('Изменение цены > 50%', 'Price change > 50%', 'Cenas izmaiņa > 50%'), s.largePriceChanges, 'warn')}
                        {stat(l('Дубликаты SKU', 'Duplicate SKUs', 'SKU dublikāti'), s.duplicateSkus, 'bad')}
                        {stat(l('Конфликты', 'Conflicts', 'Konflikti'), s.conflicts, 'bad')}
                        {stat(l('Некорректные значения', 'Invalid values', 'Nederīgas vērtības'), s.invalidValues, 'bad')}
                        {stat(l('Деактиваций', 'Deactivations', 'Deaktivizācijas'), s.deactivations)}
                    </div>
                    <p className="text-sm font-medium">{l('Остатки и резервы не изменятся. Нулевая price2 сохраняет цену, но помечает ERP-цену отсутствующей по прежним правилам.', 'Stock and reservations stay unchanged. Zero price2 keeps the price but marks the ERP price missing under existing rules.', 'Atlikumi un rezervācijas nemainās. Nulles price2 saglabā cenu, bet atzīmē ERP cenu kā trūkstošu saskaņā ar esošajiem noteikumiem.')}</p>
                    {!preview.maintenanceReady && <p role="alert" className="text-sm text-amber-700">{errorMessage('maintenance_required', l)}</p>}
                    <p className="text-xs text-muted-foreground">
                        {l('Связанных товаров нет в файле (не изменятся): ', 'Linked products missing from file (left unchanged): ', 'Saistītie produkti, kuru nav failā (netiks mainīti): ')}{s.linkedMissingFromXml}
                        {s.softDeletedSkipped > 0 && <> · {l('Удалённые товары (пропуск): ', 'Deleted products (skipped): ', 'Dzēstie produkti (izlaisti): ')}{s.softDeletedSkipped}</>}
                    </p>

                    {preview.hard.length > 0 && (
                        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm space-y-1">
                            <div className="font-semibold text-red-700 dark:text-red-300">
                                {l('Критические ошибки — применение заблокировано, каталог не изменён:', 'Critical errors — apply is blocked, the catalog was not changed:', 'Kritiskas kļūdas — piemērošana bloķēta, katalogs nav mainīts:')}
                            </div>
                            <ul className="list-disc pl-5 font-mono text-xs">{preview.hard.map(h => <li key={h}>{h}</li>)}</ul>
                        </div>
                    )}
                    {preview.warnings.length > 0 && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-1">
                            <div className="font-semibold text-amber-800 dark:text-amber-300">{l('Предупреждения — проверьте перед подтверждением:', 'Warnings — review before confirming:', 'Brīdinājumi — pārbaudiet pirms apstiprināšanas:')}</div>
                            <ul className="list-disc pl-5 font-mono text-xs">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>
                        </div>
                    )}

                    <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">{l('Примеры записей (до 10 в каждой группе)', 'Sample records (up to 10 per group)', 'Ierakstu piemēri (līdz 10 katrā grupā)')}</summary>
                        <div className="mt-2 grid gap-3 md:grid-cols-2 font-mono text-xs">
                            <SampleList title={l('Не сопоставлены', 'Unmatched', 'Nesasaistīti')} items={preview.samples.unlinked} />
                            <SampleList title={l('Дубликаты SKU', 'Duplicate SKUs', 'SKU dublikāti')} items={preview.samples.duplicates} />
                            <SampleList title={l('Некорректные значения', 'Invalid values', 'Nederīgas vērtības')} items={preview.samples.invalidValues.map(v => `${v.sku} ${v.field}="${v.value}"`)} />
                            <SampleList title={l('Изменения цен', 'Price changes', 'Cenu izmaiņas')} items={preview.samples.priceChanges.map(c => `${c.externalId}: ${String(c.before)} → ${String(c.after)}`)} />
                            <SampleList title={l('Изменения остатков', 'Stock changes', 'Atlikumu izmaiņas')} items={preview.samples.stockChanges.map(c => `${c.externalId}: ${String(c.before)} → ${String(c.after)}`)} />
                        </div>
                    </details>

                    {preview.canApply && (
                        <div className="space-y-3 border-t border-border pt-4">
                            {preview.syncRunning && (
                                <p className="text-sm text-amber-700 dark:text-amber-300">{l('Сейчас идёт автоматическая синхронизация — применение будет отклонено, пока она не закончится.', 'An automatic sync is running — apply will be refused until it finishes.', 'Notiek automātiskā sinhronizācija — piemērošana tiks noraidīta, līdz tā beigsies.')}</p>
                            )}
                            <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy !== null} />
                                <span>{l('Я проверил сводку и предупреждения. Файл свежий и выгружен из GrinS.', 'I reviewed the summary and warnings. The file is fresh and exported from GrinS.', 'Esmu pārbaudījis kopsavilkumu un brīdinājumus. Fails ir svaigs un eksportēts no GrinS.')}</span>
                            </label>
                            <Button type="button" onClick={onApply} disabled={!confirmed || busy !== null || preview.hard.length > 0 || !preview.maintenanceReady || preview.syncRunning || preview.mode !== 'prices-only'}>
                                {busy === 'apply' ? l('Применение… не закрывайте страницу', 'Applying… do not close the page', 'Piemēro… neaizveriet lapu') : l('Применить цены', 'Apply prices', 'Piemērot cenas')}
                            </Button>
                            {preview.expiresAt && <p className="text-xs text-muted-foreground">{l('Проверка действительна до ', 'Preview valid until ', 'Priekšskatījums derīgs līdz ')}{new Date(preview.expiresAt).toLocaleTimeString()}</p>}
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{l('Журнал синхронизаций (последние 20)', 'Sync log (last 20)', 'Sinhronizāciju žurnāls (pēdējās 20)')}</h3>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()}>{l('Обновить', 'Refresh', 'Atsvaidzināt')}</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="text-muted-foreground text-left">
                            <tr>
                                <th className="py-1 pr-3">{l('Начало', 'Started', 'Sākums')}</th>
                                <th className="py-1 pr-3">{l('Тип', 'Type', 'Veids')}</th>
                                <th className="py-1 pr-3">{l('Статус', 'Status', 'Statuss')}</th>
                                <th className="py-1 pr-3">{l('Записей / обработано', 'Rows / processed', 'Ieraksti / apstrādāti')}</th>
                                <th className="py-1 pr-3">{l('Изменено цен (план)', 'Price changes (planned)', 'Cenu izmaiņas (plāns)')}</th>
                                <th className="py-1 pr-3">{l('Файл / пользователь', 'File / user', 'Fails / lietotājs')}</th>
                                <th className="py-1 pr-3">{l('Ошибка', 'Error', 'Kļūda')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(run => (
                                <tr key={run.id} className="border-t border-border align-top">
                                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(run.startedAt).toLocaleString()}</td>
                                    <td className="py-1 pr-3">{run.mode === 'prices-only' ? l('только цены', 'prices only', 'tikai cenas') : run.triggeredBy === 'cron' ? l('авто', 'scheduled', 'automātiski') : l('прежний режим', 'previous mode', 'iepriekšējais režīms')}</td>
                                    <td className={`py-1 pr-3 font-medium ${run.status === 'completed' ? 'text-green-700 dark:text-green-400' : run.status === 'failed' ? 'text-red-700 dark:text-red-400' : ''}`}>{run.status}</td>
                                    <td className="py-1 pr-3 tabular-nums">{run.productsTotal} / {run.productsSynced}</td>
                                    <td className="py-1 pr-3 tabular-nums">{run.changes ? run.changes.price : '—'}</td>
                                    <td className="py-1 pr-3 break-all">{[run.fileName, run.actor, run.sha256?.slice(0, 12)].filter(Boolean).join(' · ')}</td>
                                    <td className="py-1 pr-3 break-words max-w-xs">{[run.stage, run.fatal, ...run.hardFailures].filter(Boolean).join('; ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

function SampleList({ title, items }: { title: string; items: string[] }): React.ReactElement | null {
    if (items.length === 0) return null;
    return (
        <div>
            <div className="font-sans font-semibold mb-1">{title}</div>
            <ul className="space-y-0.5">{items.map(item => <li key={item} className="break-all">{item}</li>)}</ul>
        </div>
    );
}
