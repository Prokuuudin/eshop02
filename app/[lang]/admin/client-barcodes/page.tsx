'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import AdminGate from '@/components/admin/AdminGate';
import IconSearch from '@/components/ui/icon-search';
import { pointsToEuros } from '@/lib/bonus-program';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';

import { useAdminClientBarcodesPage } from './useAdminClientBarcodesPage'

export default function AdminClientBarcodesPage(): React.ReactElement {
  const pageState = useAdminClientBarcodesPage()
  const { tl, language, formError, message, search, setSearch, cardHolders, cardHoldersTotal, cardHoldersLoading, noCardRequests, setNoCardDrafts, rejectNotes, setRejectNotes, emailBusy, getNoCardDraft, regenerateCardNumber, handleApproveNoCardRequest, handleRejectNoCardRequest } = pageState
  const locale = getLocaleFromLanguage(language)
return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-foreground">
                            {tl('admin.clientBarcodes.title', 'Клиентские баркоды', 'Client barcodes', 'Klientu barkodi')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {tl('admin.clientBarcodes.subtitle', 'Поиск клиентов по номеру карты и выдача карт мастерам без карты.', 'Look up clients by card number and issue cards to masters without one.', 'Klientu meklēšana pēc kartes numura un karšu izsniegšana meistariem bez kartes.')}
                        </p>
                        <div className="relative mt-3 w-full max-w-sm">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                                                <p className="text-sm text-muted-foreground">
                                                    {new Date(req.requestedAt).toLocaleString('ru-RU')}
                                                </p>
                                            </div>
                                            {req.certificateName && (
                                                <a
                                                    href={`/api/admin/access-requests/${encodeURIComponent(req.id)}/certificate`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                                                >
                                                    📄 {req.certificateName}
                                                </a>
                                            )}
                                        </div>

                                        {req.message && (
                                            <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground italic">
                                                «{req.message}»
                                            </p>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                            <label htmlFor={`company-name-${req.id}`} className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">Название компании</span>
                                                <Input
                                                    id={`company-name-${req.id}`}
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
                                            <label htmlFor={`card-number-${req.id}`} className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">Номер карты</span>
                                                <div className="flex gap-2">
                                                    <Input
                                                        id={`card-number-${req.id}`}
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
                                                        onClick={() => void regenerateCardNumber(req.id)}
                                                    >
                                                        ↺
                                                    </Button>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="pt-1">
                                            <label className="text-sm text-muted-foreground block mb-1">
                                                Комментарий к отказу{' '}
                                                <span className="text-muted-foreground">(необязательно — будет добавлен в письмо)</span>
                                            </label>
                                            <Textarea
                                                value={rejectNotes[req.id] ?? ''}
                                                onChange={(e) =>
                                                    setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                                                }
                                                rows={2}
                                                placeholder="Например: предоставленный документ не является действующим сертификатом..."
                                                className="w-full resize-none text-sm"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={emailBusy[req.id]}
                                                onClick={() => handleApproveNoCardRequest(req.id, req.email)}
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

                {/* ── Держатели карт ── */}
                <section className="rounded-lg border border-border bg-card p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {tl('admin.clientBarcodes.holders', 'Держатели карт', 'Card holders', 'Karšu turētāji')}{' '}
                        <span className="text-muted-foreground font-normal text-base">
                            {search.trim() ? `${cardHolders.length} / ${cardHoldersTotal}` : cardHoldersTotal}
                        </span>
                    </h2>

                    {cardHoldersLoading ? (
                        <p className="text-sm text-muted-foreground py-4">Загрузка...</p>
                    ) : cardHolders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            {search.trim() ? `Ничего не найдено по запросу «${search}»` : 'Держателей карт пока нет.'}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="pb-2 pr-4 font-medium">Карта</th>
                                        <th className="pb-2 pr-4 font-medium">Имя</th>
                                        <th className="pb-2 pr-4 font-medium">Email</th>
                                        <th className="pb-2 pr-4 font-medium">Телефон</th>
                                        <th className="pb-2 font-medium">Бонусы</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {cardHolders.map((holder) => (
                                        <tr key={holder.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="py-2 pr-4 font-mono text-xs">{holder.cardNumber ?? '—'}</td>
                                            <td className="py-2 pr-4">{holder.name || holder.companyName || '—'}</td>
                                            <td className="py-2 pr-4 font-mono text-xs">{holder.email}</td>
                                            <td className="py-2 pr-4">{holder.phone ?? '—'}</td>
                                            <td className="py-2">
                                                {holder.bonusPoints}
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    ({formatEuro(pointsToEuros(holder.bonusPoints ?? 0), locale)})
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </AdminGate>
    );
}
