'use client';

import type { LucideIcon } from 'lucide-react';

type Props = {
    eyebrow: string;
    title?: string;
    description?: string;
    icon?: LucideIcon;
};

const AccountPageHero: React.FC<Props> = ({ eyebrow, title, description, icon: Icon }) => {
    return (
        <div className="account-page-hero p-4 mb-6 bg-white dark:bg-gray-900 rounded-lg shadow flex items-center gap-4">
            {Icon && <Icon className="w-8 h-8 text-indigo-600" />}
            <div>
                <div className="text-xs uppercase tracking-wider text-indigo-600 font-semibold">
                    {eyebrow}
                </div>
                {title && <h1 className="text-xl font-bold mt-1 mb-1">{title}</h1>}
                {description && (
                    <div className="text-gray-600 dark:text-gray-300 text-sm">{description}</div>
                )}
            </div>
        </div>
    );
};

export default AccountPageHero;
