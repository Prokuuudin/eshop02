import React from 'react';

interface AccountManagerCardProps {
    name: string;
    phone: string;
    email: string;
    t: (key: string) => string;
    tl: (...args: any[]) => string;
}

const AccountManagerCard: React.FC<AccountManagerCardProps> = ({ name, phone, email, t, tl }) => (
    <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-900/30">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {tl(
                'account.page.managerCard.title',
                'Ваш аккаунт-менеджер',
                'Your account manager',
                'Jusu konta menedzeris'
            )}
        </p>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{name}</p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {tl('account.page.managerCard.phoneLabel', 'Телефон', 'Phone', 'Talrunis')}: {phone}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Email: {email}</p>
    </div>
);

export default AccountManagerCard;
