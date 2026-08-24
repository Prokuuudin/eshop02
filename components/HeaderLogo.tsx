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
            className="header__brand relative flex h-[72px] w-[104px] min-w-0 items-center gap-3 min-[400px]:h-[84px] min-[400px]:w-[150px] lg:h-24 lg:w-[180px]"
        >
            <Image
                src={resolveImageSrc('/logo-2026.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 block h-[68px] w-auto origin-left -translate-y-1/2 dark:hidden min-[400px]:-left-1 min-[400px]:h-[84px] lg:-left-[13px] lg:h-[108px] lg:scale-125"
            />
            <Image
                src={resolveImageSrc('/logo-white-2026.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 hidden h-[68px] w-auto origin-left -translate-y-1/2 dark:block min-[400px]:-left-1 min-[400px]:h-[84px] lg:-left-[13px] lg:h-[108px] lg:scale-125"
            />
        </Link>
    );
}
