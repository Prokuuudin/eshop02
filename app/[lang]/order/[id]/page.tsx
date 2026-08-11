'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { pointsToEuros } from '@/lib/bonus-program';
import ReturnRequestDialog from '@/components/ReturnRequestDialog';
import ShareOrderButton from '@/components/ShareOrderButton';
import { LoaderCircle } from 'lucide-react';
import { COMPANY } from '@/data/company';
import { formatOrderAddressLatvian } from '@/lib/order-address';

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

import { useOrderPage } from './useOrderPage'

export default function OrderPage({ params }: PageProps): React.ReactElement {
  const pageState = useOrderPage({ params })
  if (React.isValidElement(pageState)) return pageState
  const orderPageState = pageState as Exclude<ReturnType<typeof useOrderPage>, React.ReactElement>
  const { t, order, locale, paymentCheckPending, retryingPayment, downloadingInvoiceLang, returnDialogOpen, setReturnDialogOpen, getDeliveryLabel, getPaymentLabel, formatCurrency, getStatusLabel, getStatusClasses, getPaymentStatusLabel, getPaymentStatusClasses, status, timelineSteps, currentStatusIndex, handleRetryPayment, handleDownloadInvoice } = orderPageState
  const displayPhone = COMPANY.phone.replace(/^(\+371)(\d{8})$/, '$1 $2')
  const displayAddress = formatOrderAddressLatvian(order)
return (
        <main className="w-full px-4 py-5 sm:py-8">
            <div className="max-w-4xl mx-auto">
                {/* Success message */}
                <div className="mb-4 text-center sm:mb-6">
                    <div className="mb-1 text-4xl sm:mb-2 sm:text-5xl">✓</div>
                    <h1 className="mb-1 text-2xl font-bold text-foreground sm:text-3xl">
                        {t('order.successTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground sm:text-base">
                        {t('order.successDescription')}
                    </p>
                </div>

                {/* Order details */}
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                    {/* Main info */}
                    <div className="order-2 space-y-4 md:order-1 md:col-span-2 md:space-y-5">
                        {/* Order ID and date */}
                        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">
                                        {t('order.orderId')}
                                    </p>
                                    <p className="text-xl font-bold text-primary">{order.id}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">
                                        {t('order.dateLabel')}
                                    </p>
                                    <p className="text-lg font-medium text-foreground">
                                        {formatDate(order.createdAt, locale)}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                        status
                                    )}`}
                                >
                                    {getStatusLabel(status)}
                                </span>
                            </div>
                            <div className="mt-4 border-t border-border pt-4">
                            <h2 className="mb-3 text-lg font-bold text-foreground">
                                {t('order.timelineTitle')}
                            </h2>
                            {status === 'cancelled' ? (
                                <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-200">
                                    {t('order.status.cancelled')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {timelineSteps.map((step, index) => {
                                        const done = index <= currentStatusIndex;
                                        const isCurrent = index === currentStatusIndex;

                                        return (
                                            <div key={step.id} className="flex items-center gap-3">
                                                <div
                                                    className={`h-3 w-3 rounded-full ${
                                                        done ? 'bg-primary' : 'bg-gray-300'
                                                    }`}
                                                />
                                                <p
                                                    className={`text-sm ${
                                                        done
                                                            ? 'text-foreground font-medium'
                                                            : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {step.label}
                                                </p>
                                                {isCurrent && (
                                                    <span className="text-xs text-primary">
                                                        • {t('order.currentStep')}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            </div>
                            {/* Delivery info */}
                            <div className="mt-4 border-t border-border pt-4">
                            <h2 className="mb-3 text-lg font-bold text-foreground">
                                {t('order.deliveryAddress')}
                            </h2>
                            <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                <p>
                                    <span className="font-medium">{t('order.recipient')}:</span>{' '}
                                    {order.firstName} {order.lastName}
                                </p>
                                <p>
                                    <span className="font-medium">{t('order.address')}:</span>{' '}
                                    {displayAddress}
                                </p>
                                <p>
                                    <span className="font-medium">{t('order.phone')}:</span>{' '}
                                    {order.phone}
                                </p>
                                <p>
                                    <span className="font-medium">{t('order.email')}:</span>{' '}
                                    {order.email}
                                </p>
                            </div>
                            {/* Delivery and payment */}
                            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:gap-4">
                            <div className="min-w-0 pr-2">
                                <h3 className="font-bold mb-2 text-foreground">
                                    {t('order.deliveryMethod')}
                                </h3>
                                <p className="text-gray-700 dark:text-gray-300">
                                    {getDeliveryLabel(order.deliveryMethod)}
                                </p>
                            </div>
                            <div className="min-w-0 border-l border-border pl-4">
                                <h3 className="font-bold mb-2 text-foreground">
                                    {t('order.paymentMethod')}
                                </h3>
                                <p className="text-gray-700 dark:text-gray-300">
                                    {getPaymentLabel(order.paymentMethod)}
                                </p>
                                <div className="mt-3">
                                    <span
                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPaymentStatusClasses(
                                            order.paymentStatus
                                        )}`}
                                    >
                                        {paymentCheckPending
                                            ? t('order.paymentStatus.checking')
                                            : getPaymentStatusLabel(order.paymentStatus)}
                                    </span>
                                </div>
                                {order.paymentStatus === 'failed' && order.paymentProvider === 'stripe' && (
                                    <Button
                                        className="mt-3 w-full"
                                        size="sm"
                                        disabled={retryingPayment}
                                        onClick={handleRetryPayment}
                                    >
                                        {retryingPayment ? t('order.paymentStatus.checking') : t('order.retryPayment')}
                                    </Button>
                                )}
                            </div>
                            </div>
                        </div>
                        </div>

                        {/* Items */}
                        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
                            <h2 className="mb-3 text-lg font-bold text-foreground">
                                {t('order.itemsInOrder')}
                            </h2>
                            <div className="space-y-3">
                                {order.items.map((item) => (
                                    <div
                                        key={item.lineKey}
                                        className="flex gap-3 border-b border-border pb-3 last:border-b-0"
                                    >
                                        <Link
                                            href={`/product/${item.id}`}
                                            className="flex-shrink-0"
                                        >
                                            <Image
                                                src={item.image || '/placeholder.png'}
                                                alt={item.title}
                                                width={80}
                                                height={80}
                                                className="rounded object-cover"
                                            />
                                        </Link>
                                        <div className="flex-1">
                                            <Link
                                                href={`/product/${item.id}`}
                                                className="hover:text-primary dark:hover:text-primary/70"
                                            >
                                                <h3 className="font-medium text-foreground">
                                                    {item.title}
                                                </h3>
                                            </Link>
                                            {item.variantLabel && (
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {item.variantLabel}
                                                </p>
                                            )}
                                            <p className="text-sm text-muted-foreground">
                                                {item.brand}
                                            </p>
                                            <div className="mt-2 flex justify-between items-center">
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    {t('order.quantity')}: {item.quantity}
                                                </span>
                                                <span className="font-medium text-foreground">
                                                    {formatCurrency(item.price * item.quantity)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary sidebar */}
                    <div className="order-1 md:order-2 md:col-span-1">
                        <div className="sticky top-24 rounded-lg border border-border bg-card p-4 sm:p-5">
                            <h2 className="mb-3 text-lg font-bold text-foreground">
                                {t('order.summaryTitle')}
                            </h2>
                            <div className="mb-3 space-y-1.5 border-b border-border pb-3 text-sm text-gray-700 dark:text-gray-300">
                                <div className="flex justify-between">
                                    <span>{t('order.items')}:</span>
                                    <span className="font-medium text-foreground">
                                        {formatCurrency(order.subtotal)}
                                    </span>
                                </div>
                                {order.discount > 0 && (
                                    <div className="flex justify-between text-green-600 dark:text-green-300">
                                        <span>
                                            {t('checkout.summary.discount').replace(/:\s*$/, '')}
                                            {order.promoCode && (
                                                <span className="text-muted-foreground">
                                                    {' '}({order.promoCode}
                                                    {order.subtotal > 0 &&
                                                        ` −${Math.round((order.discount / order.subtotal) * 100)}%`}
                                                    )
                                                </span>
                                            )}
                                            :
                                        </span>
                                        <span className="font-medium">
                                            -{formatCurrency(order.discount)}
                                        </span>
                                    </div>
                                )}
                                {(order.bonusSpent ?? 0) > 0 && (
                                    <div className="flex justify-between text-green-600 dark:text-green-300">
                                        <span>{t('order.bonusSpent')}:</span>
                                        <span className="font-medium">
                                            -{formatCurrency(pointsToEuros(order.bonusSpent ?? 0))}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span>{t('order.taxVat')}:</span>
                                    <span className="font-medium text-foreground">
                                        {formatCurrency(order.tax)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{t('order.shipping')}:</span>
                                    <span className="font-medium text-foreground">
                                        {order.delivery === 0
                                            ? t('order.free')
                                            : formatCurrency(order.delivery)}
                                    </span>
                                </div>
                            </div>
                            <div className="mb-3 flex justify-between border-b border-border pb-3 text-lg font-bold text-foreground">
                                <span>{t('order.total')}:</span>
                                <span className="text-primary">
                                    {formatCurrency(order.total)}
                                </span>
                            </div>

                            {order.promoCode && (
                                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm">
                                    <p className="font-medium text-green-700 dark:text-green-200">
                                        {t('order.promoApplied')}
                                    </p>
                                    <p className="text-green-600 dark:text-green-300">
                                        {order.promoCode}
                                    </p>
                                </div>
                            )}

                            {(order.bonusEarned ?? 0) > 0 && (
                                <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-primary/5 dark:bg-primary/15 border border-primary/30 dark:border-primary/40 rounded text-sm">
                                    <span className="font-medium text-primary dark:text-primary/60">
                                        {t('order.bonusEarned')}
                                    </span>
                                    <span className="shrink-0 text-primary">
                                        +{order.bonusEarned ?? 0}
                                        <span className="ml-1 font-normal text-primary/70">
                                            (= {formatCurrency(pointsToEuros(order.bonusEarned ?? 0))})
                                        </span>
                                    </span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex items-stretch gap-2">
                                    <Button className="flex-1 min-w-0 h-auto whitespace-normal py-2.5" onClick={() => handleDownloadInvoice('lv')} disabled={downloadingInvoiceLang !== null}>
                                        {downloadingInvoiceLang === 'lv' && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                        {downloadingInvoiceLang === 'lv' ? t('order.generatingInvoice') : t('order.downloadInvoice')}
                                    </Button>
                                    <ShareOrderButton order={order} invoiceLang="lv" />
                                </div>
                                <div className="flex items-stretch gap-2">
                                    <Button className="flex-1 min-w-0 h-auto whitespace-normal py-2.5" onClick={() => handleDownloadInvoice('en')} disabled={downloadingInvoiceLang !== null}>
                                        {downloadingInvoiceLang === 'en' && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                        {downloadingInvoiceLang === 'en' ? t('order.generatingInvoice') : t('order.downloadInvoiceEn')}
                                    </Button>
                                    <ShareOrderButton order={order} invoiceLang="en" />
                                </div>
                                {order.paymentStatus === 'paid' && (
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => setReturnDialogOpen(true)}
                                    >
                                        {t('returns.requestButton', 'Запросить возврат')}
                                    </Button>
                                )}
                                <Link href="/catalog" className="block">
                                    <Button variant="outline" className="w-full">
                                        {t('order.continueShopping')}
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Help section */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-800 dark:bg-blue-900/30 sm:p-5">
                    <h3 className="font-bold mb-2 text-foreground">
                        {t('order.helpTitle')}
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                        {t('order.helpWrite')}{' '}
                        <a className="font-medium text-primary underline underline-offset-2 hover:no-underline" href={`mailto:${COMPANY.email}`}>
                            {COMPANY.email}
                        </a>{' '}
                        {t('order.helpOrCall')}{' '}
                        <a className="font-medium text-primary underline underline-offset-2 hover:no-underline" href={`tel:${COMPANY.phone}`}>
                            {displayPhone}
                        </a>
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {t('order.workHours')}
                    </p>
                </div>
            </div>

            <ReturnRequestDialog
                order={order}
                open={returnDialogOpen}
                onOpenChange={setReturnDialogOpen}
            />
        </main>
    );
}
