import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';

export default function HeaderLogo(): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Link
            href="/"
            className="header__brand relative flex items-center gap-3 w-[120px] min-[400px]:w-[180px]"
            style={{ height: 96, minWidth: 100, minHeight: 72 }}
        >
            <Image
                src="/logo.svg"
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 -translate-y-1/2 block dark:hidden h-[72px] w-auto min-[400px]:h-[108px]"
            />
            <Image
                src="/logo-white.svg"
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 -translate-y-1/2 hidden dark:block h-[72px] w-auto min-[400px]:h-[108px]"
            />
        </Link>
    );
}
