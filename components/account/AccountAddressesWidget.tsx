'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, ChevronRight, Plus } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useSavedAddresses } from '@/lib/saved-addresses-store';
import { useTranslation } from '@/lib/use-translation';

export const AccountAddressesWidget: React.FC = () => {
    const { t } = useTranslation();
    const { getByEmail } = useSavedAddresses();
    const [addresses, setAddresses] = useState<any[]>([]);

    useEffect(() => {
        const user = getCurrentUser();
        if (user?.email) setAddresses(getByEmail(user.email));
    }, [getByEmail]);

    const preview = addresses[0];

    return (
        <Link
            href="/account/addresses"
            className="group flex flex-col rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm hover:shadow-md hover:border-emerald-200 dark:border-emerald-800 dark:bg-emerald-900/30 dark:hover:border-emerald-700 transition-all"
        >
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-emerald-600 shadow-sm dark:bg-gray-950/40 dark:text-emerald-400">
                    <MapPin className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
            </div>

            <p className="text-sm font-semibold text-foreground">
                {t('account.savedAddressesTitle')}
            </p>

            {preview ? (
                <div className="mt-2 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                        {preview.firstName} {preview.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {preview.address}, {preview.city}
                    </p>
                    {addresses.length > 1 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5">
                            +{addresses.length - 1} {t('account.moreAddresses')}
                        </p>
                    )}
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground flex-1">
                    {t('account.page.savedAddressesHint')}
                </p>
            )}

            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {preview ? t('account.manageAddresses') : t('account.addAddress')}
                <ChevronRight className="h-3.5 w-3.5" />
            </span>
        </Link>
    );
};
