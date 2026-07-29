'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { BookmarkPlus, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useOrderTemplatesStore } from '@/lib/order-templates-store';
import { useTranslation } from '@/lib/use-translation';

export const AccountTemplatesWidget: React.FC = () => {
    const { t } = useTranslation();
    const allTemplates = useOrderTemplatesStore((s) => s.templates);
    const userId = useAuthStore((state) => state.user?.id ?? null);

    const templates = useMemo(
        () => (userId ? allTemplates.filter((tp) => tp.userId === userId) : []),
        [allTemplates, userId]
    );

    const first = templates[0];

    return (
        <Link
            href="/account/templates"
            className="group flex flex-col rounded-2xl border border-primary/10 bg-primary/5 p-5 shadow-sm hover:shadow-md hover:border-primary/30 dark:border-primary/40 dark:bg-primary/10 dark:hover:border-primary/70 transition-all"
        >
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-primary shadow-sm dark:bg-gray-950/40 dark:text-primary">
                    <BookmarkPlus className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-primary dark:group-hover:text-primary/80 transition-colors" />
            </div>

            <p className="text-sm font-semibold text-foreground">
                {t('templates.widgetTitle')}
            </p>

            {first ? (
                <div className="mt-2 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-medium truncate">
                        {first.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {first.items.length} {t('templates.itemsUnit')}
                    </p>
                    {templates.length > 1 && (
                        <p className="text-xs text-primary mt-1.5">
                            +{templates.length - 1} {t('templates.moreTemplates')}
                        </p>
                    )}
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground flex-1">
                    {t('templates.widgetHint')}
                </p>
            )}

            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary">
                {first ? t('templates.manageTemplates') : t('templates.widgetCta')}
                <ChevronRight className="h-3.5 w-3.5" />
            </span>
        </Link>
    );
};
