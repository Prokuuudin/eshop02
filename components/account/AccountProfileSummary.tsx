'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { UserCircle2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccountProfileSummaryProps {
    user: {
        name?: string;
        email: string;
        phone?: string;
        avatarUrl?: string;
        cardNumber?: string;
        companyName?: string;
    };
    t: (key: string, defaultValue?: string) => string;
    tl: (...args: any[]) => string;
}

const AccountProfileSummary: React.FC<AccountProfileSummaryProps> = ({ user, t, tl }) => {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-5 flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm overflow-hidden">
                    {user.avatarUrl ? (
                        <Image
                            src={user.avatarUrl}
                            alt={user.name || 'avatar'}
                            width={64}
                            height={64}
                            className="object-cover w-16 h-16"
                        />
                    ) : (
                        <UserCircle2 className="h-8 w-8" />
                    )}
                </div>
                <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-foreground">
                        {user.name || t('account.userDefault')}
                    </h2>
                    <p className="mt-0.5 break-all text-sm text-muted-foreground">
                        {user.email}
                    </p>
                    {user.phone && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {user.phone}
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-1.5 text-sm">
                {user.cardNumber && (
                    <div className="flex gap-2">
                        <span className="text-muted-foreground">
                            {tl('account.page.cardNumber', 'Номер карты', 'Card number', 'Kartes numurs')}:
                        </span>
                        <span className="font-mono text-foreground">{user.cardNumber}</span>
                    </div>
                )}
                {user.companyName && (
                    <div className="flex gap-2">
                        <span className="text-muted-foreground">
                            {tl('account.page.company', 'Компания', 'Company', 'Uzņēmums')}:
                        </span>
                        <span className="text-foreground">{user.companyName}</span>
                    </div>
                )}
            </div>

            <Button asChild className="mt-5 w-full" variant="outline" size="sm">
                <Link href="/account/profile">
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('account.editProfile')}
                </Link>
            </Button>
        </div>
    );
};

export default AccountProfileSummary;
