'use client';

import React from 'react';
import { Share2, Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/lib/use-translation';
import { useToast } from '@/lib/toast-context';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { buildInvoiceHtml, fetchInvoiceTitles, type InvoiceLang } from '@/lib/invoice-template';
import { buildInvoicePdfBlob, invoicePdfFileName } from '@/lib/invoice-pdf';
import { buildShareChannelUrl } from '@/lib/share-order';
import type { Order } from '@/lib/orders-store';

interface ShareOrderButtonProps {
    order: Order;
    invoiceLang: InvoiceLang;
}

export default function ShareOrderButton({ order, invoiceLang }: ShareOrderButtonProps): React.ReactElement {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    // Starts false to match SSR (no `navigator` on the server); a browser that
    // supports the Web Share API flips this after mount. Two distinct render
    // trees below (native-share button vs. dropdown) avoid ever fighting
    // Radix's own pointerdown-to-open handling on the trigger.
    const supportsNativeShare = React.useSyncExternalStore(
        () => () => undefined,
        () => typeof navigator.share === 'function',
        () => false
    );
    const [isSharing, setIsSharing] = React.useState(false);
    const [invoiceFile, setInvoiceFile] = React.useState<File | null>(null);

    // Pre-build the invoice file on mount, not inside the click handler:
    // navigator.share() requires transient user activation, and awaiting a
    // network fetch between the click and the share() call loses that
    // activation window — the call then silently fails (or rejects with an
    // error the user never sees). Building the file ahead of time lets the
    // click handler call navigator.share() synchronously.
    React.useEffect(() => {
        let cancelled = false;
        fetchInvoiceTitles(order.items, invoiceLang)
            .then(async (titles) => {
                if (cancelled) return;
                const html = buildInvoiceHtml(order, titles, invoiceLang);
                const pdfBlob = await buildInvoicePdfBlob(html);
                if (cancelled) return;
                setInvoiceFile(new File([pdfBlob], invoicePdfFileName(order.id, invoiceLang), { type: 'application/pdf' }));
            })
            .catch(() => {
                // Pre-fetch failed (e.g. offline) — native share below just falls
                // back to text-only sharing since invoiceFile stays null.
            });
        return () => {
            cancelled = true;
        };
    }, [order, invoiceLang]);

    const shareLabel = t('order.share', 'Share');
    const shareText = t(
        'order.shareText',
        'hairshoppro.lv — заказ №{orderId}, сумма {total}',
        { orderId: order.id, total: formatEuro(order.total, getLocaleFromLanguage(language)) }
    );

    if (supportsNativeShare) {
        const handleNativeShare = () => {
            const shareData: ShareData = { title: shareText, text: shareText };
            const canAttachFile =
                invoiceFile !== null &&
                typeof navigator.canShare === 'function' &&
                navigator.canShare({ files: [invoiceFile] });

            setIsSharing(true);
            try {
                // Called synchronously (no await above this point) so the browser
                // still treats it as a direct response to the user's click.
                const sharePromise = canAttachFile
                    ? navigator.share({ ...shareData, files: [invoiceFile as File] })
                    : navigator.share(shareData);

                sharePromise
                    .catch((err: unknown) => {
                        if (err instanceof Error && err.name === 'AbortError') return;
                        showToast(t('order.shareFailed', 'Sharing failed. Please try again.'), 'error');
                    })
                    .finally(() => setIsSharing(false));
            } catch (err) {
                setIsSharing(false);
                if (err instanceof Error && err.name === 'AbortError') return;
                showToast(t('order.shareFailed', 'Sharing failed. Please try again.'), 'error');
            }
        };

        return (
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-auto shrink-0" aria-label={shareLabel} onClick={handleNativeShare} disabled={isSharing}>
                            <Share2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{shareLabel}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    const emailLabel = t('order.shareEmail', 'Email');
    const whatsappLabel = t('order.shareWhatsapp', 'WhatsApp');
    const telegramLabel = t('order.shareTelegram', 'Telegram');

    return (
        <TooltipProvider delayDuration={150}>
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-auto shrink-0" aria-label={shareLabel}>
                                <Share2 className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{shareLabel}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('email', shareText)}
                                    aria-label={emailLabel}
                                >
                                    <Mail className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{emailLabel}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('whatsapp', shareText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={whatsappLabel}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{whatsappLabel}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuItem asChild>
                                <a
                                    href={buildShareChannelUrl('telegram', shareText)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={telegramLabel}
                                >
                                    <Send className="h-4 w-4" />
                                </a>
                            </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right">{telegramLabel}</TooltipContent>
                    </Tooltip>
                </DropdownMenuContent>
            </DropdownMenu>
        </TooltipProvider>
    );
}
