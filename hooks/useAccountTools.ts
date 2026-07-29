import { Activity, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { User } from '@/lib/auth'

type AccountTool = {
    title: string
    description: string
    href: string
    linkLabel: string
    icon: LucideIcon
    classes: string
    linkClasses: string
}

function getAccountToolsImpl(
    user: User | null,
    tl: (key: string, ru: string, en: string, lv: string) => string
): AccountTool[] {
    const tools = [
        {
            title: tl('account.page.tools.analytics.title', 'Статистика покупок', 'Purchase analytics', 'Pirkumu statistika'),
            description: tl('account.page.tools.analytics.description', 'Просмотр аналитики и динамики заказов', 'View analytics and order dynamics', 'Analitikas un pasutijumu dinamikas parskats'),
            href: '/account/analytics',
            linkLabel: tl('account.page.tools.analytics.linkLabel', 'Просмотр аналитики', 'View analytics', 'Skatit analitiku'),
            icon: Activity,
            classes: 'border-primary/10 bg-primary/5 dark:border-primary/40 dark:bg-primary/15',
            linkClasses: 'text-primary dark:text-primary/70',
        },
        // ... (другие объекты)
    ];
    if (user?.companyId) {
        tools.push({
            title: tl('account.page.tools.rfq.title', 'Запрос спецпредложения (RFQ)', 'Special offer request (RFQ)', 'Ipaso piedavajumu pieprasijums (RFQ)'),
            description: tl('account.page.tools.rfq.description', 'Отправка запроса на персональные условия', 'Submit a request for custom terms', 'Nosutit pieprasijumu personalizetiem noteikumiem'),
            href: '/request-quote',
            linkLabel: tl('account.page.tools.rfq.linkLabel', 'Создать RFQ заявку', 'Create RFQ request', 'Izveidot RFQ pieprasijumu'),
            icon: CreditCard,
            classes: 'border-amber-100 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30',
            linkClasses: 'text-amber-700 dark:text-amber-300',
        });
    }
    return tools;
}

export const getAccountTools: typeof getAccountToolsImpl = getAccountToolsImpl
