'use client';
import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useOrders, type OrderLegalDetails } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { buildInvoiceHtml, fetchInvoiceTitles, type InvoiceLang } from '@/lib/invoice-template';
import { buildInvoicePdfBlob, invoicePdfFileName } from '@/lib/invoice-pdf';
import { useToast } from '@/lib/toast-context';
import { localizePath } from '@/lib/i18n-routing';

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

function useOrderPageState({ params }: PageProps) {
    const { id } = React.use(params);
    const searchParams = useSearchParams();
    const { t, language } = useTranslation();
    const { getOrder, updateOrderPayment, upsertOrder } = useOrders();
    const { getOrderStatus } = useAdminStore();
    const localOrder = getOrder(id);
    const [serverOrder, setServerOrder] = React.useState<ReturnType<typeof getOrder> | null>(null);
    const [serverOrderLoading, setServerOrderLoading] = React.useState(true);
    const [serverOrderResolved, setServerOrderResolved] = React.useState(false);
    const order = serverOrder ?? localOrder;
    const locale = getLocaleFromLanguage(language);
    const [paymentCheckPending, setPaymentCheckPending] = React.useState(
        () => searchParams.get('payment') === 'success' && Boolean(searchParams.get('session_id'))
    );
    const [retryingPayment, setRetryingPayment] = React.useState(false);
    const [downloadingInvoiceLang, setDownloadingInvoiceLang] = React.useState<InvoiceLang | null>(null);
    const [returnDialogOpen, setReturnDialogOpen] = React.useState(false);
    const { showToast } = useToast();

    React.useEffect(() => {
        if (serverOrderResolved) return;

        let isMounted = true;
        fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: 'no-store' })
            .then(async (res) => {
                if (res.status === 404) return null;
                if (!res.ok) throw new Error('Failed to load server order');

                const payload = (await res.json()) as {
                    order?: {
                        id: string;
                        createdAt: string;
                        items: Array<{
                            id: string;
                            lineKey: string;
                            variantLabel?: string;
                            title: string;
                            brand: string;
                            image: string;
                            category: string;
                            price: number;
                            rating: number;
                            stock: number;
                            quantity: number;
                        }>;
                        subtotal: number;
                        tax: number;
                        delivery: number;
                        deliveryMethod: 'courier' | 'pickup' | 'post';
                        paymentMethod: string;
                        promoCode?: string;
                        discount: number;
                        total: number;
                        firstName: string;
                        lastName: string;
                        email: string;
                        phone: string;
                        address: string;
                        city: string;
                        postalCode?: string;
                        bonusSpent?: number;
                        bonusEarned?: number;
                        paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'failed';
                        paymentProvider?: 'stripe' | 'manual';
                        paymentSessionId?: string;
                        legalDetails?: OrderLegalDetails;
                    };
                };

                if (!payload.order) return null;

                return {
                    ...payload.order,
                    createdAt: new Date(payload.order.createdAt),
                    items: payload.order.items.map((item) => ({
                        ...item,
                        category: item.category as import('@/data/products').CategoryType,
                    })),
                };
            })
            .then((loadedOrder) => {
                if (!isMounted) return;
                setServerOrder(loadedOrder);

                if (loadedOrder) {
                    upsertOrder(loadedOrder);
                }
            })
            .catch(() => {
                if (!isMounted) return;
                setServerOrder(null);
            })
            .finally(() => {
                if (!isMounted) return;
                setServerOrderResolved(true);
                setServerOrderLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [id, serverOrderResolved, upsertOrder]);

    const applyOrderPaymentUpdate = React.useCallback(
        (
            orderId: string,
            updates: Partial<
                Pick<
                    NonNullable<typeof order>,
                    'paymentStatus' | 'paymentProvider' | 'paymentSessionId'
                >
            >
        ) => {
            updateOrderPayment(orderId, updates);
            setServerOrder((prev) =>
                prev && prev.id === orderId ? { ...prev, ...updates } : prev
            );
        },
        [updateOrderPayment]
    );

    const getDeliveryLabel = (deliveryMethod: string): string => {
        if (deliveryMethod === 'courier') return t('order.delivery.courier');
        if (deliveryMethod === 'pickup') return t('order.delivery.pickup');
        return t('order.delivery.post');
    };

    const getPaymentLabel = (paymentMethod: string): string => {
        if (paymentMethod === 'card') return t('order.payment.card');
        if (paymentMethod === 'bank') return t('order.payment.bank');
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

    React.useEffect(() => {
        if (!order) return;

        const paymentState = searchParams.get('payment');
        const sessionId = searchParams.get('session_id');

        if (paymentState === 'cancelled') {
            let cancelled = false;
            queueMicrotask(() => {
                if (cancelled) return;
                applyOrderPaymentUpdate(order.id, {
                    paymentStatus: 'failed',
                    paymentProvider: 'stripe',
                });
            });
            return () => {
                cancelled = true;
            };
        }

        if (paymentState !== 'success' || !sessionId) return;

        let isMounted = true;
        fetch('/api/payments/stripe/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('Payment verification failed');
                return (await res.json()) as {
                    paymentStatus?: 'paid' | 'pending' | 'failed';
                    sessionId?: string;
                };
            })
            .then((result) => {
                if (!isMounted) return;
                applyOrderPaymentUpdate(order.id, {
                    paymentStatus: result.paymentStatus || 'pending',
                    paymentProvider: 'stripe',
                    paymentSessionId: result.sessionId || sessionId,
                });
            })
            .catch(() => {
                if (!isMounted) return;
                applyOrderPaymentUpdate(order.id, {
                    paymentStatus: 'pending',
                    paymentProvider: 'stripe',
                    paymentSessionId: sessionId,
                });
            })
            .finally(() => {
                if (isMounted) setPaymentCheckPending(false);
            });

        return () => {
            isMounted = false;
        };
    }, [applyOrderPaymentUpdate, order, searchParams]);

    React.useEffect(() => {
        if (!order || order.paymentProvider !== 'stripe') return;

        let isMounted = true;

        fetch(`/api/payments/status?orderId=${encodeURIComponent(order.id)}`, {
            cache: 'no-store',
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('Server payment status failed');
                return (await res.json()) as {
                    paymentStatus?: 'paid' | 'pending' | 'failed';
                    sessionId?: string;
                };
            })
            .then((serverPayment) => {
                if (!isMounted || !serverPayment.paymentStatus) return;
                applyOrderPaymentUpdate(order.id, {
                    paymentStatus: serverPayment.paymentStatus,
                    paymentProvider: 'stripe',
                    paymentSessionId: serverPayment.sessionId || order.paymentSessionId,
                });
            })
            .catch(() => {
                // Keep local status when server status endpoint is unavailable.
            });

        return () => {
            isMounted = false;
        };
    }, [applyOrderPaymentUpdate, order]);

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

    const status = getOrderStatus(order.id);
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

    const handleRetryPayment = async (): Promise<void> => {
        setRetryingPayment(true);
        try {
            const response = await fetch('/api/payments/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: order.id,
                    email: order.email,
                    grandTotal: order.total,
                    items: order.items.map((item) => ({
                        id: item.id,
                        title: item.title,
                        quantity: item.quantity,
                        price: item.price,
                    })),
                }),
            });

            if (!response.ok) {
                showToast('Не удалось начать оплату. Попробуйте снова.', 'error');
                setRetryingPayment(false);
                return;
            }

            const payload = (await response.json()) as { url?: string };
            if (!payload.url) {
                showToast('Платёжная сессия не была создана. Попробуйте снова.', 'error');
                setRetryingPayment(false);
                return;
            }

            window.location.href = payload.url;
        } catch {
            showToast('Ошибка сети. Попробуйте снова.', 'error');
            setRetryingPayment(false);
        }
    };

    const handleDownloadInvoice = async (invoiceLang: InvoiceLang): Promise<void> => {
        if (downloadingInvoiceLang !== null) return;
        setDownloadingInvoiceLang(invoiceLang);
        try {
            const titles = await fetchInvoiceTitles(order.items, invoiceLang);
            const html = buildInvoiceHtml(order, titles, invoiceLang);
            const blob = await buildInvoicePdfBlob(html);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = invoicePdfFileName(order.id, invoiceLang);
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch {
            showToast(t('order.invoiceDownloadFailed'), 'error');
        } finally {
            setDownloadingInvoiceLang(null);
        }
    };

      return { id, searchParams, t, language, getOrder, updateOrderPayment, upsertOrder, getOrderStatus, localOrder, serverOrder, setServerOrder, serverOrderLoading, setServerOrderLoading, serverOrderResolved, setServerOrderResolved, order, locale, paymentCheckPending, setPaymentCheckPending, retryingPayment, setRetryingPayment, downloadingInvoiceLang, returnDialogOpen, setReturnDialogOpen, showToast, applyOrderPaymentUpdate, getDeliveryLabel, getPaymentLabel, formatCurrency, getStatusLabel, getStatusClasses, getPaymentStatusLabel, getPaymentStatusClasses, status, timelineSteps, statusOrder, currentStatusIndex, handleRetryPayment, handleDownloadInvoice }
}

export function useOrderPage({ params }: PageProps): ReturnType<typeof useOrderPageState> {
  return useOrderPageState({ params })
}
