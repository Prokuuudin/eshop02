'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ReturnReason } from '@/lib/returns-store';
import { formatEuro } from '@/lib/utils';
import type { useAdminReturnsPage } from './useAdminReturnsPage';

const REASON_LIST: ReturnReason[] = ['defective', 'wrong_item', 'changed_mind', 'not_as_described', 'damaged', 'other'];
type State = ReturnType<typeof useAdminReturnsPage>;
type Props = { state: State; reasonLabels: Record<ReturnReason, string> };

export default function ReturnCreateForm({ state, reasonLabels }: Props): React.ReactElement {
    const {
        locale,
        l,
        showCreate,
        setShowCreate,
        formOrderId,
        setFormOrderId,
        foundOrder,
        lookupPending,
        formReason,
        setFormReason,
        formComment,
        setFormComment,
        formRefund,
        formFirstName,
        formLastName,
        formEmail,
        formPhone,
        formItems,
        formError,
        lookupOrder,
        updateItemQty,
        submitReturn,
    } = state;

    return (
        <>
        {/* Create form */}
        {showCreate && (
            <div className="rounded-xl border border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/20/10 p-5 space-y-4">
                <h2 className="text-base font-semibold text-foreground">
                    {l('Новая заявка на возврат', 'New return request', 'Jauns atgriešanas pieprasījums')}
                </h2>
        
                {/* Order lookup */}
                <div className="flex gap-2">
                    <Input
                        type="text"
                        value={formOrderId}
                        onChange={(e) => setFormOrderId(e.target.value)}
                        placeholder={l('ID заказа (например ORD-...)', 'Order ID (for example ORD-...)', 'Pasūtījuma ID (piemēram, ORD-...)')}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <Button size="sm" variant="outline" onClick={lookupOrder} disabled={lookupPending}>
                        {lookupPending ? l('Поиск…', 'Searching…', 'Meklēšana…') : l('Найти заказ', 'Find order', 'Atrast pasūtījumu')}
                    </Button>
                </div>
        
                {formError && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{formError}</p>
                )}
        
                {foundOrder && (
                    <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
                        {l('Найден заказ', 'Order found', 'Pasūtījums atrasts')} · {foundOrder.firstName} {foundOrder.lastName} ·{' '}
                        {formatEuro(foundOrder.total, locale)}
                    </div>
                )}
        
                {/* Customer info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                        value={formFirstName}
                        readOnly
                        placeholder={l('Имя *', 'First name *', 'Vārds *')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <Input
                        value={formLastName}
                        readOnly
                        placeholder={l('Фамилия', 'Last name', 'Uzvārds')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <Input
                        value={formEmail}
                        readOnly
                        placeholder="Email *"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <Input
                        value={formPhone}
                        readOnly
                        placeholder={l('Телефон', 'Phone', 'Tālrunis')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                </div>
        
                {/* Reason + refund */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Select
                        value={formReason}
                        onValueChange={(v) => setFormReason(v as ReturnReason)}
                    >
                        <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {REASON_LIST.map((r) => (
                                <SelectItem key={r} value={r}>
                                    {reasonLabels[r]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                        {l('Рассчитано по заказу:', 'Calculated from order:', 'Aprēķināts no pasūtījuma:')} {formatEuro(formRefund, locale)}
                    </div>
                    <Input
                        value={formComment}
                        onChange={(e) => setFormComment(e.target.value)}
                        placeholder={l('Комментарий клиента', 'Customer comment', 'Klienta komentārs')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                </div>
        
                {/* Items from order */}
                {formItems.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                            {l('Возвращаемые товары', 'Products being returned', 'Atgriežamie produkti')}
                        </p>
                        <div className="rounded-lg border border-border divide-y divide-border bg-card">
                            {formItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                                    {item.image && (
                                        <Image
                                            unoptimized
                                            src={item.image}
                                            alt={item.title}
                                            width={32}
                                            height={32}
                                            className="w-8 h-8 object-cover rounded shrink-0"
                                        />
                                    )}
                                    <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                                        {item.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground shrink-0">
                                        {formatEuro(item.price, locale)}
                                    </p>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={item.quantity}
                                        onChange={(e) =>
                                            updateItemQty(idx, Number(e.target.value))
                                        }
                                        className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-center text-foreground"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
        
                <div className="flex gap-2">
                    <Button onClick={submitReturn}>{l('Создать заявку', 'Create request', 'Izveidot pieprasījumu')}</Button>
                    <Button variant="outline" onClick={() => setShowCreate(false)}>
                        {l('Отмена', 'Cancel', 'Atcelt')}
                    </Button>
                </div>
            </div>
        )}
        </>
    );
}
