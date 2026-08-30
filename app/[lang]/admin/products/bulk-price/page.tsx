'use client';

import { ChevronDown, Info } from 'lucide-react';
import AdminGate from '@/components/admin/AdminGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CATEGORY_OPTIONS } from '@/lib/admin/products/constants';
import { describeChange, formatMoney } from './bulk-price-model';
import { useBulkPricePage } from './useBulkPricePage';

export default function BulkPricePage(): React.ReactElement {
    const {
        locale,
        l,
        products,
        total,
        page,
        setPage,
        loading,
        saving,
        selected,
        searchInput,
        setSearchInput,
        catFilter,
        setCatFilter,
        mode,
        setMode,
        value,
        setValue,
        oldPriceAction,
        setOldPriceAction,
        pendingAction,
        setPendingAction,
        lastResult,
        serverBatches,
        actionMessage,
        historyOpen,
        setHistoryOpen,
        expandedBatchIds,
        toggleBatch,
        numValue,
        operationValid,
        totalPages,
        toggle,
        clearSelection,
        preview,
        applyChanges,
        performRevert,
        prepareFailedRetry,
        MODE_OPTIONS,
    } = useBulkPricePage();

    return (
        <AdminGate access="full">
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {l('Массовый редактор цен', 'Bulk price editor', 'Masveida cenu redaktors')}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {l('Выберите товары и примените изменение цены', 'Select products and apply a price change', 'Atlasiet produktus un piemērojiet cenas izmaiņu')}
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-3 text-sm font-semibold text-foreground">
                        {l('Настройка изменения', 'Change settings', 'Izmaiņu iestatījumi')}
                    </h2>
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <p className="mb-1 block text-xs text-muted-foreground">{l('Тип изменения', 'Change type', 'Izmaiņas veids')}</p>
                            <div className="flex h-10 items-center rounded-lg border border-border bg-muted p-1">
                                {MODE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setMode(opt.value)}
                                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                                            mode === opt.value
                                                ? 'scale-105 bg-emerald-600 text-white shadow-md'
                                                : 'text-muted-foreground hover:bg-background'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="bulk-price-value" className="mb-1 block text-xs text-muted-foreground">{l('Значение', 'Value', 'Vērtība')}</label>
                            <Input
                                id="bulk-price-value"
                                type="number"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={MODE_OPTIONS.find((o) => o.value === mode)?.placeholder}
                                className="w-40 text-sm"
                            />
                        </div>
                        <div>
                            <p className="mb-1 block text-xs text-muted-foreground">{l('Старая цена', 'Old price', 'Vecā cena')}</p>
                            <Select
                                value={oldPriceAction}
                                onValueChange={(next) => {
                                    if (next === 'save_current' || next === 'clear') setOldPriceAction(next);
                                }}
                            >
                                <SelectTrigger className="w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="save_current">{l('Зачеркнуть старую цену', 'Cross out old price', 'Pārsvītrot veco cenu')}</SelectItem>
                                    <SelectItem value="clear">{l('Убрать старую цену', 'Remove old price', 'Noņemt veco cenu')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p aria-hidden className="mb-1 block text-xs text-transparent">·</p>
                            <button
                                type="button"
                                onClick={() => setPendingAction({ type: 'apply' })}
                                disabled={!operationValid || selected.size === 0 || saving}
                                className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                            >
                                {saving ? l('Сохранение...', 'Saving...', 'Saglabāšana...') : l(`Применить к ${selected.size} товарам`, `Apply to ${selected.size} products`, `Piemērot ${selected.size} produktiem`)}
                            </button>
                        </div>
                    </div>
                </div>

                <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
                    <DialogContent>
                        {pendingAction?.type === 'revert' ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle>{l('Вернуть предыдущие цены', 'Restore previous prices', 'Atjaunot iepriekšējās cenas')}</DialogTitle>
                                    <DialogDescription>
                                        {l(`Будут восстановлены цены ${pendingAction.batch.items.length} товаров до состояния на ${new Date(pendingAction.batch.appliedAt).toLocaleString(locale)}. Товары, изменённые позже, будут безопасно пропущены.`, `Prices for ${pendingAction.batch.items.length} products will be restored to their state at ${new Date(pendingAction.batch.appliedAt).toLocaleString(locale)}. Products changed later will be skipped safely.`, `${pendingAction.batch.items.length} produktu cenas tiks atjaunotas uz stāvokli ${new Date(pendingAction.batch.appliedAt).toLocaleString(locale)}. Vēlāk mainītie produkti tiks droši izlaisti.`)}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <button type="button" className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                                            {l('Отмена', 'Cancel', 'Atcelt')}
                                        </button>
                                    </DialogClose>
                                    <button
                                        type="button"
                                        onClick={() => performRevert(pendingAction.batch)}
                                        className="h-10 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
                                    >
                                        {l('Вернуть цены', 'Restore prices', 'Atjaunot cenas')}
                                    </button>
                                </DialogFooter>
                            </>
                        ) : (
                            <>
                                <DialogHeader>
                                    <DialogTitle>{l('Подтвердите изменение цены', 'Confirm price change', 'Apstipriniet cenas izmaiņu')}</DialogTitle>
                                    <DialogDescription>
                                        {l(`Изменение «${describeChange(mode, numValue, oldPriceAction, locale, l)}» будет применено к ${selected.size} товарам и сразу записано в базу данных.`, `The “${describeChange(mode, numValue, oldPriceAction, locale, l)}” change will be applied to ${selected.size} products and saved immediately.`, `Izmaiņa “${describeChange(mode, numValue, oldPriceAction, locale, l)}” tiks piemērota ${selected.size} produktiem un uzreiz saglabāta.`)}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <button type="button" className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                                            {l('Отмена', 'Cancel', 'Atcelt')}
                                        </button>
                                    </DialogClose>
                                    <button
                                        type="button"
                                        onClick={applyChanges}
                                        className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
                                    >
                                        {l('Применить', 'Apply', 'Piemērot')}
                                    </button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>

                {lastResult && (
                    <div
                        role="status"
                        className={`rounded-xl border p-4 ${
                            lastResult.err === 0
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                        }`}
                    >
                        <div className="font-semibold">
                            {lastResult.kind === 'apply' ? l('Изменение цен завершено', 'Price change completed', 'Cenu maiņa pabeigta') : l('Возврат цен завершён', 'Price revert completed', 'Cenu atjaunošana pabeigta')}
                        </div>
                        <p className="mt-1 text-sm">
                            {l('Успешно:', 'Successful:', 'Veiksmīgi:')} {lastResult.ok} {l('из', 'of', 'no')} {lastResult.items.length}.
                            {lastResult.err > 0 && l(` Не удалось: ${lastResult.err}. Причины указаны ниже.`, ` Failed: ${lastResult.err}. Reasons are listed below.`, ` Neizdevās: ${lastResult.err}. Iemesli norādīti zemāk.`)}
                        </p>
                        {lastResult.kind === 'apply' && lastResult.err > 0 && (
                            <button
                                type="button"
                                onClick={() => prepareFailedRetry(lastResult)}
                                disabled={saving}
                                className="mt-3 rounded-md border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                            >
                                {l('Обновить данные и проверить неудавшиеся товары', 'Refresh and review failed products', 'Atjaunināt un pārbaudīt neveiksmīgos produktus')}
                            </button>
                        )}
                        {lastResult.items.some((item) => item.status === 'err') && (
                            <ul className="mt-3 space-y-1 text-xs">
                                {lastResult.items.filter((item) => item.status === 'err').map((item) => (
                                    <li key={item.id}>
                                        <span className="font-medium">{item.title}</span>: {item.error}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {actionMessage && (
                    <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        {actionMessage}
                    </div>
                )}

                <div className="order-2 flex flex-wrap items-center gap-3">
                    <Input
                        type="text"
                        placeholder={l('Поиск по названию, бренду, SKU...', 'Search by title, brand, SKU...', 'Meklēt pēc nosaukuma, zīmola, SKU...')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full text-sm sm:w-72"
                    />
                    <Select value={catFilter || 'all'} onValueChange={(v) => setCatFilter(v === 'all' ? '' : v)}>
                        <SelectTrigger className="w-48 shrink-0 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{l('Все категории', 'All categories', 'Visas kategorijas')}</SelectItem>
                            {CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        <span>{l('Выбрано:', 'Selected:', 'Atlasīti:')} {selected.size}</span>
                        {selected.size > 0 && (
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="underline hover:no-underline"
                            >
                                {l('Снять выбор', 'Clear selection', 'Noņemt atlasi')}
                            </button>
                        )}
                        <span>· {l('Показано', 'Showing', 'Parādīti')} {products.length} {l('из', 'of', 'no')} {total}</span>
                    </span>
                </div>

                <div className="order-2 overflow-x-auto rounded-xl border border-border bg-card">
                    {loading ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">{l('Загрузка...', 'Loading...', 'Ielāde...')}</div>
                    ) : products.length === 0 ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">{l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted">
                                <tr>
                                    <th className="w-10 px-4 py-3" />
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Товар', 'Product', 'Produkts')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Бренд', 'Brand', 'Zīmols')}
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        {l('Категория', 'Category', 'Kategorija')}
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        {l('Текущая цена', 'Current price', 'Pašreizējā cena')}
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        {l('Новая цена', 'New price', 'Jaunā cena')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {products.map((p) => {
                                    const newPrice = preview(p);
                                    const isSelected = selected.has(p.id);
                                    const changed = newPrice !== null && newPrice !== p.price;
                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => toggle(p)}
                                            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                                                isSelected
                                                    ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                                                    : ''
                                            }`}
                                        >
                                            <td className="px-4 py-3">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggle(p)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground">
                                                    {p.title}
                                                </div>
                                                {p.sku && (
                                                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {p.brand}
                                            </td>
                                            <td className="px-4 py-3 capitalize text-muted-foreground">
                                                {p.category}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {formatMoney(p.price, locale)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {newPrice !== null ? (
                                                    <span
                                                        className={`font-medium ${
                                                            changed
                                                                ? newPrice < p.price
                                                                    ? 'text-red-600 dark:text-red-400'
                                                                    : 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-muted-foreground'
                                                        }`}
                                                    >
                                                        {formatMoney(newPrice, locale)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="order-2 flex items-center justify-between text-sm text-muted-foreground">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1 || loading}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            {l('Назад', 'Back', 'Atpakaļ')}
                        </button>
                        <span>{l('Страница', 'Page', 'Lapa')} {page} {l('из', 'of', 'no')} {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages || loading}
                            className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                        >
                            {l('Вперёд', 'Next', 'Tālāk')}
                        </button>
                    </div>
                )}

                {serverBatches.length > 0 && (
                    <div className="order-1 rounded-xl border border-border bg-card">
                        <button
                            type="button"
                            onClick={() => setHistoryOpen((v) => !v)}
                            className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 p-4 text-left text-sm font-semibold text-foreground"
                        >
                            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`} />
                            {l('История изменений цен', 'Price change history', 'Cenu izmaiņu vēsture')}
                            <span className="text-xs font-normal text-muted-foreground">
                                — {l('когда, кто и сколько товаров менял; операцию можно раскрыть и вернуть прежние цены', 'when, who, and how many products were changed; expand an operation to restore previous prices', 'kad, kas un cik produktus mainīja; izvērsiet darbību, lai atjaunotu iepriekšējās cenas')}
                            </span>
                        </button>
                        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${historyOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                            <div className="overflow-hidden">
                                <div className="px-4 pb-4">
                                    <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                                        <Info className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                                        {l('Постоянная история из журнала аудита доступна после обновления страницы и с любого устройства. Показаны последние 30 операций.', 'Persistent audit history remains available after refresh and from any device. The latest 30 operations are shown.', 'Pastāvīgā audita vēsture ir pieejama pēc lapas atjaunošanas un no jebkuras ierīces. Parādītas pēdējās 30 darbības.')}
                                    </p>
                                    <div className="space-y-2">
                                        {serverBatches.map((batch) => {
                                            const availableCount = batch.items.filter((item) => item.state === 'available').length;
                                            const batchOpen = expandedBatchIds.has(batch.requestId);
                                            return (
                                                <div key={batch.requestId} className="rounded-lg border border-border">
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleBatch(batch.requestId)}
                                                            className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
                                                        >
                                                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${batchOpen ? 'rotate-180' : ''}`} />
                                                            <span className="text-muted-foreground">
                                                                {new Date(batch.appliedAt).toLocaleString(locale)}
                                                            </span>
                                                            <span className="font-medium text-foreground">
                                                                {batch.action === 'product.revert' ? l('Возврат', 'Revert', 'Atjaunošana') : l('Изменение', 'Change', 'Izmaiņa')} · {batch.items.length} {l('товаров', 'products', 'produkti')} · {batch.adminEmail}
                                                            </span>
                                                        </button>
                                                        {batch.revertState === 'reverted' ? (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                                {l('цены возвращены', 'prices restored', 'cenas atjaunotas')}
                                                            </span>
                                                        ) : batch.revertState === 'not_available' ? (
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                                {l('товары изменены позже — откат недоступен', 'products changed later — revert unavailable', 'produkti mainīti vēlāk — atjaunošana nav pieejama')}
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setPendingAction({ type: 'revert', batch })}
                                                                disabled={saving}
                                                                className="text-xs font-medium text-amber-700 underline hover:no-underline disabled:opacity-40 dark:text-amber-400"
                                                            >
                                                                {batch.revertState === 'partial' ? l(`Вернуть оставшиеся ${availableCount}`, `Restore remaining ${availableCount}`, `Atjaunot atlikušos ${availableCount}`) : l('Вернуть предыдущие цены', 'Restore previous prices', 'Atjaunot iepriekšējās cenas')}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${batchOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                                        <div className="overflow-hidden">
                                                            <div className="overflow-x-auto border-t border-border">
                                                                <table className="w-full text-sm">
                                                                    <tbody className="divide-y divide-border">
                                                                        {batch.items.map((item) => (
                                                                            <tr key={item.id}>
                                                                                <td className="px-3 py-2 text-foreground">{item.title}</td>
                                                                                <td className="px-3 py-2 text-right text-muted-foreground">
                                                                                    {formatMoney(item.before.price, locale)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right font-medium text-foreground">
                                                                                    → {formatMoney(item.after.price, locale)}
                                                                                </td>
                                                                                <td className="px-3 py-2 text-right">
                                                                                    <span className={
                                                                                        item.state === 'reverted'
                                                                                            ? 'text-muted-foreground'
                                                                                            : item.state === 'available'
                                                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                                                : 'text-amber-600 dark:text-amber-400'
                                                                                    }>
                                                                                        {item.state === 'reverted' ? l('возвращено', 'restored', 'atjaunots') : item.state === 'available' ? l('действует', 'active', 'aktīvs') : l('изменено позже', 'changed later', 'mainīts vēlāk')}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminGate>
    );
}
