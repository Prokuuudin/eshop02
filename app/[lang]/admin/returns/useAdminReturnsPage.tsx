'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    useReturnsStore,
    mapServerReturn,
    type ReturnStatus,
    type ReturnReason,
    type ReturnItem,
} from '@/lib/returns-store';
import type { ServerOrder } from '@/lib/orders-data-store';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { adminFetchJson, reportAdminError } from '@/lib/admin-ui-errors';
import { logAdminAction } from '@/lib/admin-log-store';

const STATUS_LIST: ReturnStatus[] = ['pending', 'approved', 'rejected', 'refunded', 'completed'];

function generateReturnId() {
    return `RET-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

const RETURNS_PAGE_SIZE = 200;

async function loadAllReturns(): Promise<ReturnType<typeof mapServerReturn>[]> {
    const all: ReturnType<typeof mapServerReturn>[] = [];
    let skip = 0;
    for (;;) {
        const payload = await adminFetchJson<{
            returns?: Array<Parameters<typeof mapServerReturn>[0]>;
            total?: number;
        }>(`/api/returns?skip=${skip}&take=${RETURNS_PAGE_SIZE}`);
        const page = Array.isArray(payload.returns) ? payload.returns.map(mapServerReturn) : [];
        all.push(...page);
        const total = typeof payload.total === 'number' ? payload.total : all.length;
        if (all.length >= total || page.length < RETURNS_PAGE_SIZE) return all;
        skip += page.length;
    }
}

function useAdminReturnsPageState() {
    const { language, locale, l } = useAdminLocale();
    const { returns, addReturn, setReturnStatus, setReturns } = useReturnsStore();

    useEffect(() => {
        loadAllReturns()
            .then(setReturns)
            .catch((error) => reportAdminError(error, l('Возвраты', 'Returns', 'Atgriešana')));
    }, [l, setReturns]);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<ReturnStatus | 'all'>('all');
    const [reasonFilter, setReasonFilter] = useState<ReturnReason | 'all'>('all');
    const [expandedReturn, setExpandedReturn] = useState<string | null>(null);
    const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});
    const [notifySending, setNotifySending] = useState<string | null>(null);
    const [notifyResult, setNotifyResult] = useState<Record<string, 'ok' | 'error'>>({});

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [formOrderId, setFormOrderId] = useState('');
    const [foundOrder, setFoundOrder] = useState<ServerOrder | undefined>(undefined);
    const [lookupPending, setLookupPending] = useState(false);
    const [formReason, setFormReason] = useState<ReturnReason>('defective');
    const [formComment, setFormComment] = useState('');
    const [formFirstName, setFormFirstName] = useState('');
    const [formLastName, setFormLastName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formItems, setFormItems] = useState<ReturnItem[]>([]);
    const [formError, setFormError] = useState('');

    const statsByStatus = useMemo(
        () =>
            STATUS_LIST.reduce((acc, s) => {
                acc[s] = returns.filter((r) => r.status === s).length;
                return acc;
            }, {} as Record<ReturnStatus, number>),
        [returns]
    );

    const totalRefund = useMemo(
        () => returns.reduce((sum, r) => sum + r.refundAmount, 0),
        [returns]
    );
    const formRefund = useMemo(
        () => formItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
        [formItems]
    );

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return returns
            .filter((r) => {
                const matchSearch =
                    !q ||
                    r.id.toLowerCase().includes(q) ||
                    r.orderId.toLowerCase().includes(q) ||
                    r.firstName.toLowerCase().includes(q) ||
                    r.lastName.toLowerCase().includes(q) ||
                    r.email.toLowerCase().includes(q);
                const matchStatus = statusFilter === 'all' || r.status === statusFilter;
                const matchReason = reasonFilter === 'all' || r.reason === reasonFilter;
                return matchSearch && matchStatus && matchReason;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [returns, search, statusFilter, reasonFilter]);

    const sendNotification = async (ret: (typeof returns)[number]) => {
        setNotifySending(ret.id);
        setNotifyResult((prev) => {
            const n = { ...prev };
            delete n[ret.id];
            return n;
        });
        try {
            // Recipient/order/status/amount are looked up server-side from the
            // return record itself - only the id and an optional not-yet-saved
            // resolution draft are sent.
            const res = await fetch('/api/admin/returns/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    returnId: ret.id,
                    resolution: resolutionDraft[ret.id] ?? ret.resolution,
                    language,
                }),
            });
            setNotifyResult((prev) => ({ ...prev, [ret.id]: res.ok ? 'ok' : 'error' }));
        } catch {
            setNotifyResult((prev) => ({ ...prev, [ret.id]: 'error' }));
        } finally {
            setNotifySending(null);
        }
    };

    const handleReturnStatusChange = async (
        ret: (typeof returns)[number],
        status: ReturnStatus
    ): Promise<void> => {
        const result = await setReturnStatus(ret.id, status, resolutionDraft[ret.id]);
        if (!result.ok) {
            reportAdminError(
                new Error(result.error ?? 'return_update_failed'),
                l('Возвраты', 'Returns', 'Atgriešana')
            );
            return;
        }
        logAdminAction(
            'return.status_changed',
            {
                type: 'return',
                id: ret.id,
                title: `${ret.firstName} ${ret.lastName}`,
            },
            {
                before: { status: ret.status },
                after: { status },
            }
        );
    };

    const lookupOrder = async () => {
        const id = formOrderId.trim();
        if (!id) return;
        setLookupPending(true);
        try {
            const res = await fetch(`/api/orders/${encodeURIComponent(id)}`);
            const order = res.ok ? ((await res.json()) as { order: ServerOrder }).order : null;
            if (order) {
                setFoundOrder(order);
                setFormFirstName(order.firstName);
                setFormLastName(order.lastName);
                setFormEmail(order.email);
                setFormPhone(order.phone);
                setFormItems(
                    order.items.map((item) => ({
                        productId: item.id,
                        title: item.title,
                        quantity: 1,
                        price: item.price,
                        image: item.image,
                    }))
                );
                setFormError('');
            } else {
                setFoundOrder(undefined);
                setFormError(l('Заказ не найден. Можно заполнить данные вручную.', 'Order not found. You can enter the details manually.', 'Pasūtījums nav atrasts. Datus var ievadīt manuāli.'));
            }
        } catch {
            setFoundOrder(undefined);
            setFormError(l('Не удалось найти заказ. Попробуйте ещё раз.', 'Could not find the order. Try again.', 'Neizdevās atrast pasūtījumu. Mēģiniet vēlreiz.'));
        } finally {
            setLookupPending(false);
        }
    };

    const updateItemQty = (idx: number, qty: number) => {
        setFormItems((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, quantity: qty } : item))
        );
    };

    const submitReturn = async () => {
        if (!foundOrder) {
            setFormError(l('Сначала найдите существующий заказ.', 'Find an existing order first.', 'Vispirms atrodiet esošu pasūtījumu.'));
            return;
        }
        const activeItems = formItems.filter((i) => i.quantity > 0);
        if (activeItems.length === 0) {
            setFormError(l('Выберите хотя бы один товар для возврата.', 'Select at least one product to return.', 'Izvēlieties vismaz vienu atgriežamo produktu.'));
            return;
        }
        const result = await addReturn({
            id: generateReturnId(),
            orderId: formOrderId.trim() || '—',
            createdAt: new Date(),
            status: 'pending',
            reason: formReason,
            comment: formComment || undefined,
            items: activeItems,
            refundAmount: formRefund,
            firstName: formFirstName,
            lastName: formLastName,
            email: formEmail,
            phone: formPhone,
        });
        if (!result.ok) {
            setFormError(
                result.error
                    ? l(`Сервер отклонил заявку: ${result.error}`, `The server rejected the request: ${result.error}`, `Serveris noraidīja pieprasījumu: ${result.error}`)
                    : l('Не удалось сохранить заявку. Попробуйте ещё раз.', 'Could not save the request. Try again.', 'Neizdevās saglabāt pieprasījumu. Mēģiniet vēlreiz.')
            );
            return;
        }
        setShowCreate(false);
        setFormOrderId('');
        setFoundOrder(undefined);
        setFormFirstName('');
        setFormLastName('');
        setFormEmail('');
        setFormPhone('');
        setFormComment('');
        setFormItems([]);
        setFormError('');
    };

    return {
        returns,
        addReturn,
        setReturns,
        language,
        locale,
        l,
        search,
        setSearch,
        statusFilter,
        setStatusFilter,
        reasonFilter,
        setReasonFilter,
        expandedReturn,
        setExpandedReturn,
        resolutionDraft,
        setResolutionDraft,
        notifySending,
        setNotifySending,
        notifyResult,
        setNotifyResult,
        showCreate,
        setShowCreate,
        formOrderId,
        setFormOrderId,
        foundOrder,
        setFoundOrder,
        lookupPending,
        formReason,
        setFormReason,
        formComment,
        setFormComment,
        formRefund,
        formFirstName,
        setFormFirstName,
        formLastName,
        setFormLastName,
        formEmail,
        setFormEmail,
        formPhone,
        setFormPhone,
        formItems,
        setFormItems,
        formError,
        setFormError,
        statsByStatus,
        totalRefund,
        filtered,
        sendNotification,
        handleReturnStatusChange,
        lookupOrder,
        updateItemQty,
        submitReturn,
    };
}

export function useAdminReturnsPage(): ReturnType<typeof useAdminReturnsPageState> {
  return useAdminReturnsPageState()
}
