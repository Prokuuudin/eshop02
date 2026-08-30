'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { renderPreview } from './segment-model';
import type { useCustomerSegmentsPage } from './useCustomerSegmentsPage';

type SegmentsState = ReturnType<typeof useCustomerSegmentsPage>;

export function SegmentBroadcastPanel({ state }: { state: SegmentsState }): React.ReactElement | null {
    const {
        l, segmentLabel, sampleVars, unsubscribeText, counts, activeTab, showBroadcast,
        setShowBroadcast, bSubject, setBSubject, bBody, setBBody, bTab, setBTab, bResult,
        setBResult, broadcastRecipientCount, sendBroadcast, sendButtonLabel, canSend,
    } = state;

    if (!Object.values(counts).some(Boolean)) return null;

    return (
        <>
{/* Broadcast panel */}
                        
                            <div className="rounded-xl border border-primary/30 dark:border-primary/40 bg-card">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBroadcast((v) => !v);
                                        setBResult(null);
                                    }}
                                    className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-primary dark:text-primary">
                                            {l(
                                                'Рассылка по сегменту',
                                                'Segment broadcast',
                                                'Segmenta izsūtne'
                                            )}
                                        </span>
                                        <span className="rounded-full bg-primary/10 dark:bg-primary/40 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-primary">
                                            {broadcastRecipientCount}{' '}
                                            {l('получателей', 'recipients', 'saņēmēji')}
                                            {activeTab !== 'all' && ` · ${segmentLabel(activeTab)}`}
                                        </span>
                                    </div>
                                    <span className="text-muted-foreground text-xs">
                                        {showBroadcast
                                            ? `▲ ${l('Свернуть', 'Collapse', 'Sakļaut')}`
                                            : `▼ ${l('Развернуть', 'Expand', 'Izvērst')}`}
                                    </span>
                                </button>

                                {showBroadcast && (
                                    <div className="border-t border-primary/10 dark:border-primary/40 px-5 py-4 space-y-4">
                                        {/* Recipients info */}
                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <span>
                                                {l('Получатели:', 'Recipients:', 'Saņēmēji:')}{' '}
                                                <strong className="text-foreground">
                                                    {broadcastRecipientCount}
                                                </strong>
                                                {activeTab !== 'all' &&
                                                    ` · ${segmentLabel(activeTab)}`}
                                                {activeTab === 'all' &&
                                                    l(
                                                        ' (все клиенты)',
                                                        ' (all customers)',
                                                        ' (visi klienti)'
                                                    )}
                                            </span>
                                            <span className="text-muted-foreground">·</span>
                                            <span>
                                                {l('Переменные:', 'Variables:', 'Mainīgie:')}{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{first_name}'}
                                                </code>{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{last_name}'}
                                                </code>{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{email}'}
                                                </code>
                                            </span>
                                        </div>

                                        {/* Subject */}
                                        <div>
                                            <label
                                                htmlFor="broadcast-subject"
                                                className="block text-xs font-medium text-muted-foreground mb-1"
                                            >
                                                {l('Тема письма', 'Email subject', 'E-pasta tēma')}
                                            </label>
                                            <Input
                                                id="broadcast-subject"
                                                value={bSubject}
                                                onChange={(e) => setBSubject(e.target.value)}
                                                placeholder={l(
                                                    'Например: Привет, {first_name}! Специальное предложение для вас',
                                                    'For example: Hi, {first_name}! A special offer for you',
                                                    'Piemēram: Sveiki, {first_name}! Īpašs piedāvājums jums'
                                                )}
                                            />
                                        </div>

                                        {/* Body with edit/preview tabs */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label
                                                    htmlFor="broadcast-body"
                                                    className="text-xs font-medium text-muted-foreground"
                                                >
                                                    {l(
                                                        'Текст письма',
                                                        'Email body',
                                                        'E-pasta teksts'
                                                    )}
                                                </label>
                                                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                                                    {(['edit', 'preview'] as const).map((t) => (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            onClick={() => setBTab(t)}
                                                            className={`px-3 py-1 transition-colors ${
                                                                bTab === t
                                                                    ? 'bg-primary text-primary-foreground'
                                                                    : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'
                                                            }`}
                                                        >
                                                            {t === 'edit'
                                                                ? l(
                                                                      'Редактор',
                                                                      'Editor',
                                                                      'Redaktors'
                                                                  )
                                                                : l(
                                                                      'Предпросмотр',
                                                                      'Preview',
                                                                      'Priekšskatījums'
                                                                  )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {bTab === 'edit' ? (
                                                <Textarea
                                                    id="broadcast-body"
                                                    rows={7}
                                                    value={bBody}
                                                    onChange={(e) => setBBody(e.target.value)}
                                                    placeholder={l(
                                                        'Здравствуйте, {first_name}!\n\nПишем вам по поводу...',
                                                        'Hello, {first_name}!\n\nWe are writing to you about...',
                                                        'Sveiki, {first_name}!\n\nRakstām jums par...'
                                                    )}
                                                    className="w-full resize-none text-sm"
                                                />
                                            ) : (
                                                <div className="rounded-lg border border-border bg-muted p-4 min-h-[176px]">
                                                    {bBody ? (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground mb-3">
                                                                {l('Тема:', 'Subject:', 'Tēma:')}{' '}
                                                                <span className="text-foreground">
                                                                    {renderPreview(
                                                                        bSubject,
                                                                        sampleVars
                                                                    ) || '—'}
                                                                </span>
                                                            </p>
                                                            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                                                {renderPreview(bBody, sampleVars)}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                                                                {unsubscribeText}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">
                                                            {l(
                                                                'Введите текст письма в редакторе',
                                                                'Enter the email text in the editor',
                                                                'Ievadiet e-pasta tekstu redaktorā'
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Send button + confirm dialog + result */}
                                        <div className="flex flex-wrap items-center gap-3 pt-1">
                                            <ConfirmActionDialog
                                                title={l(
                                                    'Подтвердите рассылку',
                                                    'Confirm broadcast',
                                                    'Apstipriniet izsūtni'
                                                )}
                                                description={l(
                                                    `Отправить письмо ${broadcastRecipientCount} получателям? Это действие нельзя отменить.`,
                                                    `Send the email to ${broadcastRecipientCount} recipients? This cannot be undone.`,
                                                    `Nosūtīt e-pastu ${broadcastRecipientCount} saņēmējiem? Šo darbību nevar atsaukt.`
                                                )}
                                                confirmLabel={l('Отправить', 'Send', 'Nosūtīt')}
                                                cancelLabel={l('Отмена', 'Cancel', 'Atcelt')}
                                                onConfirm={() => void sendBroadcast()}
                                                trigger={
                                                    <Button
                                                        disabled={!canSend}
                                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                                    >
                                                        {sendButtonLabel}
                                                    </Button>
                                                }
                                            />
                                            {!bSubject.trim() || !bBody.trim() ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {l(
                                                        'Заполните тему и текст',
                                                        'Enter a subject and message',
                                                        'Ievadiet tēmu un tekstu'
                                                    )}
                                                </span>
                                            ) : null}
                                            {broadcastRecipientCount > 500 && (
                                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                                    {l(
                                                        'В одной рассылке допустимо не более 500 получателей. Выберите более узкий сегмент.',
                                                        'A broadcast can have at most 500 recipients. Select a narrower segment.',
                                                        'Vienā izsūtnē drīkst būt ne vairāk kā 500 saņēmēju. Izvēlieties šaurāku segmentu.'
                                                    )}
                                                </span>
                                            )}
                                        </div>

                                        {/* Result */}
                                        {bResult && (
                                            <div
                                                className={`rounded-lg border px-4 py-3 ${
                                                    bResult.failed === 0
                                                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                                                }`}
                                            >
                                                <p className="text-sm font-medium text-foreground">
                                                    {l(
                                                        'Рассылка завершена:',
                                                        'Broadcast completed:',
                                                        'Izsūtne pabeigta:'
                                                    )}{' '}
                                                    <span className="text-green-700 dark:text-green-400">
                                                        {bResult.sent}{' '}
                                                        {l('отправлено', 'sent', 'nosūtīti')}
                                                    </span>
                                                    {bResult.failed > 0 && (
                                                        <span className="text-red-600 dark:text-red-400">
                                                            {' '}
                                                            · {bResult.failed}{' '}
                                                            {l('ошибок', 'failed', 'kļūdas')}
                                                        </span>
                                                    )}
                                                </p>
                                                {bResult.failedEmails.length > 0 && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {l(
                                                            'Не доставлено:',
                                                            'Not delivered:',
                                                            'Nav piegādāts:'
                                                        )}{' '}
                                                        {bResult.failedEmails.join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        
        </>
    );
}

