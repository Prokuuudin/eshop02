'use client';

import type { LucideIcon } from 'lucide-react';

type Props = {
    eyebrow: string;
    title?: string;
    description?: string;
    icon?: LucideIcon;
    accentClassName?: string;
};

const AccountPageHero: React.FC<Props> = ({ eyebrow, title, description, icon: Icon, accentClassName }) => {
    return (
        <div className={`account-page-hero p-4 mb-6 rounded-lg shadow flex items-center gap-4 ${accentClassName ?? 'bg-card'}`}>
            {Icon && <Icon className="w-8 h-8 text-primary" />}
            <div>
                <div className="text-xs uppercase tracking-wider text-primary font-semibold">
                    {eyebrow}
                </div>
                {title && <h1 className="text-xl font-bold mt-1 mb-1">{title}</h1>}
                {description && (
                    <div className="text-muted-foreground text-sm">{description}</div>
                )}
            </div>
        </div>
    );
};

export default AccountPageHero;
