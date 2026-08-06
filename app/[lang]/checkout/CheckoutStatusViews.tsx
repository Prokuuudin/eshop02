import type React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { useTranslation } from '@/lib/use-translation'

type T = ReturnType<typeof useTranslation>['t']

export function EmptyCartView({ t }: { t: T }): React.ReactElement {
  return (<main className="w-full px-4 py-12">
                <h1 className="text-2xl font-bold mb-4 text-foreground">
                    {t('checkout.title')}
                </h1>
                <p className="text-muted-foreground mb-4">{t('checkout.empty')}</p>
                <Link href="/catalog">
                    <Button>{t('checkout.backToCatalog')}</Button>
                </Link>
            </main>)
}
export function NoSelectedItemsView({ t }: { t: T }): React.ReactElement {
  return (<main className="w-full px-4 py-12">
                <h1 className="text-2xl font-bold mb-4 text-foreground">
                    {t('checkout.title')}
                </h1>
                <p className="text-muted-foreground mb-4">{t('checkout.noSelected')}</p>
                <Link href="/cart">
                    <Button>{t('checkout.backToCart')}</Button>
                </Link>
            </main>)
}

export function CheckoutSuccessView({ t }: { t: T }): React.ReactElement {
  return (<main className="w-full px-4 py-12">
                <div className="max-w-md mx-auto text-center">
                    <div className="text-6xl mb-4">✓</div>
                    <h1 className="text-2xl font-bold mb-2 text-foreground">
                        {t('checkout.success.title')}
                    </h1>
                    <p className="text-muted-foreground mb-4">
                        {t('checkout.success.redirect')}
                    </p>
                </div>
            </main>)
}

export function CheckoutRoleBlockedView({  }: { t: T }): React.ReactElement {
  return (<main className="w-full px-4 py-12 text-foreground">
                <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-900/30">
                    <h1 className="text-2xl font-bold mb-2">
                        Оформление недоступно для текущей роли
                    </h1>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                        Пользователь с ролью менеджера может работать с заказами и RFQ, но не
                        оформляет покупки. Для покупки используйте аккаунт с ролью buyer/admin или
                        отдельный клиентский профиль.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <Link href="/cart">
                            <Button variant="outline">Вернуться в корзину</Button>
                        </Link>
                        <Link href="/account">
                            <Button>Перейти в аккаунт</Button>
                        </Link>
                    </div>
                </div>
            </main>)
}
