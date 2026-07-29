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
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { buildInvoiceHtml, fetchInvoiceTitles } from '@/lib/invoice-template';
import { buildShareChannelUrl } from '@/lib/share-order';
import type { Order } from '@/lib/orders-store';

interface ShareOrderButtonProps {
    order: Order;
}

export default function ShareOrderButton({ order }: ShareOrderButtonProps) {
    const { t, language } = useTranslation();
    // Starts false to match SSR (no `navigator` on the server); a browser that
    // supports the Web Share API flips this after mount. Two distinct render
    // trees below (native-share button vs. dropdown) avoid ever fighting
    // Radix's own pointerdown-to-open handling on the trigger.
    const [supportsNativeShare, setSupportsNativeShare] = React.useState(false);

    React.useEffect(() => {
        setSupportsNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    }, []);

    const shareLabel = t('order.share', 'Share');
    const shareText = t(
        'order.shareText',
        'hairshop-pro.lv — заказ №{orderId}, сумма {total}',
        { orderId: order.id, total: formatEuro(order.total, getLocaleFromLanguage(language)) }
    );

    if (supportsNativeShare) {
        const handleNativeShare = async () => {
            const shareData: ShareData = { title: shareText, text: shareText };

            try {
                const titles = await fetchInvoiceTitles(order.items, 'lv');
                const html = buildInvoiceHtml(order, titles, 'lv');
                const file = new File([html], `invoice-${order.id}.html`, { type: 'text/html' });
                if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                    await navigator.share({ ...shareData, files: [file] });
                    return;
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
            }

            try {
                await navigator.share(shareData);
            } catch {
                // AbortError (user dismissed) or no-op — nothing to do either way
            }
        };

        return (
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" aria-label={shareLabel} onClick={handleNativeShare}>
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
                            <Button variant="outline" size="icon" aria-label={shareLabel}>
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
                                    target="_blank"
                                    rel="noopener noreferrer"
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
