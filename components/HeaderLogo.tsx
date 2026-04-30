import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';

export default function HeaderLogo() {
    const { t } = useTranslation();
    return (
        <Link
            href="/"
            className="header__brand flex items-center gap-3"
            style={{ width: 120, height: 96, minWidth: 100, minHeight: 72 }}
        >
            <Image
                src="/logo.jpg"
                alt={t('header.logoAlt')}
                width={100}
                height={72}
                priority
                sizes="100px"
                style={{ width: 100, height: 72 }}
            />
        </Link>
    );
}
