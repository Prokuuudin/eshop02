import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';
import { useSiteContent } from '@/lib/use-site-content';

export default function HeaderLogo(): React.ReactElement {
    const { t } = useTranslation();
    const { resolveImageSrc } = useSiteContent();
    return (
        <Link
            href="/"
            className="header__brand relative flex items-center gap-3 w-[120px] min-[400px]:w-[180px]"
            style={{ height: 96, minWidth: 100, minHeight: 72 }}
        >
            <Image
                src={resolveImageSrc('/logo.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 block h-[72px] w-auto origin-left -translate-y-1/2 scale-125 dark:hidden min-[400px]:h-[108px]"
            />
            <Image
                src={resolveImageSrc('/logo-white.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 hidden h-[72px] w-auto origin-left -translate-y-1/2 scale-125 dark:block min-[400px]:h-[108px]"
            />
        </Link>
    );
}
