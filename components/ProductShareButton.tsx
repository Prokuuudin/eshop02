'use client';

import React from 'react';
import { Share2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/use-translation';
import { useToast } from '@/lib/toast-context';
import { buildShareLinks } from '@/lib/share-links';

interface ProductShareButtonProps {
    productTitle: string;
}

export default function ProductShareButton({ productTitle }: ProductShareButtonProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    // Starts false to match SSR (no `navigator` on the server); a browser that
    // supports the Web Share API flips this after mount. Two distinct render
    // trees below (native-share button vs. dropdown) avoid ever fighting
    // Radix's own pointerdown-to-open handling on the trigger.
    const [supportsNativeShare, setSupportsNativeShare] = React.useState(false);
    const [pageUrl, setPageUrl] = React.useState('');

    React.useEffect(() => {
        setSupportsNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
        setPageUrl(window.location.href);
    }, []);

    const shareLabel = t('product.share.label', 'Share');

    if (supportsNativeShare) {
        const handleNativeShare = async () => {
            try {
                await navigator.share({ title: productTitle, url: window.location.href });
            } catch {
                // AbortError when the user dismisses the native share sheet — nothing to do
            }
        };

        return (
            <Button variant="ghost" size="icon" aria-label={shareLabel} onClick={handleNativeShare}>
                <Share2 className="h-4 w-4" />
            </Button>
        );
    }

    const shareLinks = buildShareLinks(pageUrl, productTitle);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(pageUrl);
            showToast(t('product.share.copied', 'Link copied'), 'success');
        } catch {
            // clipboard blocked (insecure context/permissions) — network buttons above still work
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={shareLabel}>
                    <Share2 className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                    <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer">
                        📘 Facebook
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.x} target="_blank" rel="noopener noreferrer">
                        𝕏 X
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.telegram} target="_blank" rel="noopener noreferrer">
                        💬 Telegram
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer">
                        🟢 WhatsApp
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyLink}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('product.share.copyLink', 'Copy link')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
