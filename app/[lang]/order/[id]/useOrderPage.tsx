'use client';
import { DELIVERY_METHOD_LABEL_KEYS, type CheckoutDeliveryMethod } from '@/lib/delivery';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useOrders, type Order } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { useToast } from '@/lib/toast-context';
import { localizePath } from '@/lib/i18n-routing';
import {
    blocksPayseraRetry,
    mergePaymentOrderSnapshot,
    payRetryResult,
    pollForPaymentConfirmation,
    type PaymentReturnState,
} from '@/lib/payment-return-polling';

type PageProps = {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        payment?: string | string[];
    }>;
};

type LoadedOrder = Order;
type WireOrder = Omit<LoadedOrder, 'createdAt'> & { createdAt: string };

function useOrderPageState({ params, searchParams }: PageProps) {
    const { id } = React.use(params);
    const query = React.use(searchParams);
    const { t, language } = useTranslation();
    const { getOrder, upsertOrder } = useOrders();
    const { getOrderStatus } = useAdminStore();
    const localOrder = getOrder(id);
    const [serverOrder, setServerOrder] = React.useState<ReturnType<typeof getOrder> | null>(null);
    const [serverOrderLoading, setServerOrderLoading] = React.useState(true);
    const [serverOrderResolved, setServerOrderResolved] = React.useState(false);
    const order = serverOrder ?? localOrder;
    const locale = getLocaleFromLanguage(language);
    const [returnDialogOpen, setReturnDialogOpen] = React.useState(false);
    const [payingNow, setPayingNow] = React.useState(false);
    const [paymentReturnState, setPaymentReturnState] = React.useState<PaymentReturnState>(
        query.payment === 'success' ? 'processing' : 'none'
    );
    const latestServerOrderRef = React.useRef<LoadedOrder | null>(null);
    const { showToast } = useToast();

    const loadServerOrder = React.useCallback(async (signal?: AbortSignal): Promise<LoadedOrder | null> => {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: 'no-store', signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('Failed to load server order');

        const payload = (await res.json()) as { order?: WireOrder };
        if (!payload.order) return null;
        return {
            ...payload.order,
            createdAt: new Date(payload.order.createdAt),
            items: payload.order.items.map((item) => ({
                ...item,
                category: item.category as import('@/data/products').CategoryType,
            })),
        };
    }, [id]);

    const applyLoadedOrder = React.useCallback((loadedOrder: LoadedOrder | null): void => {
        const acceptedOrder = mergePaymentOrderSnapshot(latestServerOrderRef.current, loadedOrder);
        if (acceptedOrder === latestServerOrderRef.current && acceptedOrder !== loadedOrder) return;
        latestServerOrderRef.current = acceptedOrder;
        setServerOrder(acceptedOrder);
        if (acceptedOrder) upsertOrder(acceptedOrder);
    }, [upsertOrder]);

    React.useEffect(() => {
        if (serverOrderResolved) return;

        let isMounted = true;
        loadServerOrder()
            .then((loadedOrder) => {
                if (!isMounted) return;
                applyLoadedOrder(loadedOrder);
            })
            .catch(() => {
                if (!isMounted) return;
                applyLoadedOrder(null);
            })
            .finally(() => {
                if (!isMounted) return;
                setServerOrderResolved(true);
                setServerOrderLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [applyLoadedOrder, loadServerOrder, serverOrderResolved]);

    React.useEffect(() => {
        if (paymentReturnState !== 'processing') return;
        const controller = new AbortController();
        let mounted = true;
        void pollForPaymentConfirmation(() => loadServerOrder(controller.signal), {
            signal: controller.signal,
            onOrder: applyLoadedOrder,
        }).then((result) => {
            if (!mounted || result === 'aborted') return;
            setPaymentReturnState(result);
        });
        return () => {
            mounted = false;
            controller.abort();
        };
    }, [applyLoadedOrder, loadServerOrder, paymentReturnState]);

    const getDeliveryLabel = (deliveryMethod: string): string => {
        const key = DELIVERY_METHOD_LABEL_KEYS[deliveryMethod as CheckoutDeliveryMethod];
        return key ? t(key) : deliveryMethod;
    };

    const getPaymentLabel = (paymentMethod: string): string => {
        if (paymentMethod === 'card') return t('order.payment.card');
        if (paymentMethod === 'bank') return t('order.payment.bank');
        if (paymentMethod === 'paysera') return t('order.payment.paysera');
        if (paymentMethod === 'paypal') return t('order.payment.paypal');
        return t('order.payment.cash');
    };

    const formatCurrency = (value: number): string => formatEuro(value, locale);

    const getStatusLabel = (status: string): string => {
        if (status === 'confirmed') return t('order.status.confirmed');
        if (status === 'shipped') return t('order.status.shipped');
        if (status === 'delivered') return t('order.status.delivered');
        if (status === 'cancelled') return t('order.status.cancelled');
        return t('order.status.pending');
    };

    const getStatusClasses = (status: string): string => {
        if (status === 'confirmed')
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
        if (status === 'shipped')
            return 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary/60';
        if (status === 'delivered')
            return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200';
        if (status === 'cancelled')
            return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200';
    };

    const getPaymentStatusLabel = (status: string | undefined): string => {
        if (status === 'paid') return t('order.paymentStatus.paid');
        if (status === 'pending') return t('order.paymentStatus.pending');
        if (status === 'failed') return t('order.paymentStatus.failed');
        return t('order.paymentStatus.unpaid');
    };

    const getPaymentStatusClasses = (status: string | undefined): string => {
        if (status === 'paid')
            return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200';
        if (status === 'pending')
            return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200';
        if (status === 'failed')
            return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
    };

    if (serverOrderLoading && !serverOrder && !localOrder) {
        return (
            <main className="w-full px-4 py-12">
                <div className="max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4 text-foreground">
                        {t('order.loading')}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('order.loadingDescription')}
                    </p>
                </div>
            </main>
        );
    }

    if (!order) {
        return (
            <main className="w-full px-4 py-12">
                <div className="max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4 text-foreground">
                        {t('order.notFoundTitle')}
                    </h1>
                    <p className="text-muted-foreground mb-6">
                        {t('order.notFoundDescription')}
                    </p>
                    <Link href={localizePath('/catalog', language)}>
                        <Button>{t('order.backToCatalog')}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    const status = order.status ?? getOrderStatus(order.id);
    const timelineSteps = [
        { id: 'pending', label: t('order.status.pending') },
        { id: 'confirmed', label: t('order.status.confirmed') },
        { id: 'shipped', label: t('order.status.shipped') },
        { id: 'delivered', label: t('order.status.delivered') },
    ];

    const statusOrder: Record<string, number> = {
        pending: 0,
        confirmed: 1,
        shipped: 2,
        delivered: 3,
        cancelled: -1,
    };

    const currentStatusIndex = statusOrder[status] ?? 0;

    const handlePayNow = async (): Promise<void> => {
        if (payingNow || paymentReturnState === 'processing'
            || paymentReturnState === 'paid' || paymentReturnState === 'timeout') return;
        setPayingNow(true);
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/pay`, { method: 'POST' });
            const payload = (await response.json().catch(() => null)) as {
                paymentUrl?: string;
                status?: string;
                error?: string;
                order?: WireOrder;
            } | null;
            const result = payRetryResult(response.ok, response.status, payload);
            if (result === 'paid' || result === 'refresh-paid') {
                const loadedOrder = payload?.order
                    ? { ...payload.order, createdAt: new Date(payload.order.createdAt) }
                    : await loadServerOrder();
                applyLoadedOrder(loadedOrder);
                if (loadedOrder?.paymentStatus === 'paid') setPaymentReturnState('paid');
                setPayingNow(false);
                return;
            }
            if (result !== 'redirect' || !payload?.paymentUrl) {
                showToast(t('order.payNowFailed'), 'error');
                setPayingNow(false);
                return;
            }
            window.location.href = payload.paymentUrl;
        } catch {
            showToast(t('order.payNowFailed'), 'error');
            setPayingNow(false);
        }
    };

      const paymentReturnBlocksRetry = blocksPayseraRetry(paymentReturnState);

      return { id, t, language, getOrder, upsertOrder, getOrderStatus, localOrder, serverOrder, setServerOrder, serverOrderLoading, setServerOrderLoading, serverOrderResolved, setServerOrderResolved, order, locale, returnDialogOpen, setReturnDialogOpen, payingNow, handlePayNow, showToast, getDeliveryLabel, getPaymentLabel, formatCurrency, getStatusLabel, getStatusClasses, getPaymentStatusLabel, getPaymentStatusClasses, status, timelineSteps, statusOrder, currentStatusIndex, paymentReturnState, paymentReturnBlocksRetry }
}

export function useOrderPage({ params, searchParams }: PageProps): ReturnType<typeof useOrderPageState> {
  return useOrderPageState({ params, searchParams })
}
