'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    useReturnsStore,
    mapServerReturn,
    type ReturnStatus,
    type ReturnReason,
    type ReturnItem,
} from '@/lib/returns-store';
import { useOrders, type Order } from '@/lib/orders-store';
import { useTranslation } from '@/lib/use-translation';
import { adminFetchJson, reportAdminError } from '@/lib/admin-ui-errors';

const STATUS_LIST: ReturnStatus[] = ['pending', 'approved', 'rejected', 'refunded', 'completed'];

function generateReturnId() {
    return `RET-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function useAdminReturnsPageState() {
    const { returns, addReturn, setReturnStatus, setReturns } = useReturnsStore();
    const { orders } = useOrders();

    useEffect(() => {
        adminFetchJson<{ returns?: Array<Parameters<typeof mapServerReturn>[0]> }>('/api/returns?take=200')
            .then(({ returns: dbReturns }) => {
                if (Array.isArray(dbReturns)) setReturns(dbReturns.map(mapServerReturn));
            })
            .catch((error) => reportAdminError(error, 'Возвраты'));
    }, [setReturns]);
    const { language } = useTranslation();
    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';

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
    const [foundOrder, setFoundOrder] = useState<Order | undefined>(undefined);
    const [formReason, setFormReason] = useState<ReturnReason>('defective');
    const [formComment, setFormComment] = useState('');
    const [formRefund, setFormRefund] = useState('');
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

    const lookupOrder = () => {
        const order = orders.find((o) => o.id === formOrderId.trim());
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
            setFormRefund(String(order.items[0]?.price ?? ''));
            setFormError('');
        } else {
            setFoundOrder(undefined);
            setFormError('Заказ не найден. Можно заполнить данные вручную.');
        }
    };

    const updateItemQty = (idx: number, qty: number) => {
        setFormItems((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, quantity: qty } : item))
        );
    };

    const submitReturn = async () => {
        if (!formFirstName || !formEmail || !formRefund) {
            setFormError('Заполните обязательные поля: имя, email, сумма возврата');
            return;
        }
        const activeItems = formItems.filter((i) => i.quantity > 0);
        const result = await addReturn({
            id: generateReturnId(),
            orderId: formOrderId.trim() || '—',
            createdAt: new Date(),
            status: 'pending',
            reason: formReason,
            comment: formComment || undefined,
            items: activeItems,
            refundAmount: Number(formRefund),
            firstName: formFirstName,
            lastName: formLastName,
            email: formEmail,
            phone: formPhone,
        });
        if (!result.ok) {
            setFormError(
                result.error
                    ? `Сервер отклонил заявку: ${result.error}`
                    : 'Не удалось сохранить заявку. Попробуйте ещё раз.'
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
        setFormRefund('');
        setFormItems([]);
        setFormError('');
    };

    return {
        returns,
        addReturn,
        setReturnStatus,
        setReturns,
        orders,
        language,
        locale,
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
        formReason,
        setFormReason,
        formComment,
        setFormComment,
        formRefund,
        setFormRefund,
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
        lookupOrder,
        updateItemQty,
        submitReturn,
    };
}

export function useAdminReturnsPage(): ReturnType<typeof useAdminReturnsPageState> {
  return useAdminReturnsPageState()
}
