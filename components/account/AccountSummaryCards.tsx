import React from 'react';

interface SummaryCard {
    title: string;
    value: string;
    caption: string;
    icon: React.ElementType;
}

interface AccountSummaryCardsProps {
    summaryCards: SummaryCard[];
}

const AccountSummaryCards: React.FC<AccountSummaryCardsProps> = ({ summaryCards }) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
        {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
                <div
                    key={card.title}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                                {card.title}
                            </p>
                            <p className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                                {card.value}
                            </p>
                        </div>
                        <div className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            <Icon className="h-4 w-4" />
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">{card.caption}</p>
                </div>
            );
        })}
    </div>
);

export default AccountSummaryCards;
