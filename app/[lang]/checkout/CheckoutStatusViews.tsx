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
                    <div className="text-6xl mb-4">âœ“</div>
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
                        ÐžÑ„Ð¾Ñ€Ð¼Ð»ÐµÐ½Ð¸Ðµ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾ Ð´Ð»Ñ Ñ‚ÐµÐºÑƒÑ‰ÐµÐ¹ Ñ€Ð¾Ð»Ð¸
                    </h1>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                        ÐŸÐ¾Ð»ÑŒÐ·Ð¾Ð²Ð°Ñ‚ÐµÐ»ÑŒ Ñ Ñ€Ð¾Ð»ÑŒÑŽ Ð¼ÐµÐ½ÐµÐ´Ð¶ÐµÑ€Ð° Ð¼Ð¾Ð¶ÐµÑ‚ Ñ€Ð°Ð±Ð¾Ñ‚Ð°Ñ‚ÑŒ Ñ Ð·Ð°ÐºÐ°Ð·Ð°Ð¼Ð¸ Ð¸ RFQ, Ð½Ð¾ Ð½Ðµ
                        Ð¾Ñ„Ð¾Ñ€Ð¼Ð»ÑÐµÑ‚ Ð¿Ð¾ÐºÑƒÐ¿ÐºÐ¸. Ð”Ð»Ñ Ð¿Ð¾ÐºÑƒÐ¿ÐºÐ¸ Ð¸ÑÐ¿Ð¾Ð»ÑŒÐ·ÑƒÐ¹Ñ‚Ðµ Ð°ÐºÐºÐ°ÑƒÐ½Ñ‚ Ñ Ñ€Ð¾Ð»ÑŒÑŽ buyer/admin Ð¸Ð»Ð¸
                        Ð¾Ñ‚Ð´ÐµÐ»ÑŒÐ½Ñ‹Ð¹ ÐºÐ»Ð¸ÐµÐ½Ñ‚ÑÐºÐ¸Ð¹ Ð¿Ñ€Ð¾Ñ„Ð¸Ð»ÑŒ.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <Link href="/cart">
                            <Button variant="outline">Ð’ÐµÑ€Ð½ÑƒÑ‚ÑŒÑÑ Ð² ÐºÐ¾Ñ€Ð·Ð¸Ð½Ñƒ</Button>
                        </Link>
                        <Link href="/account">
                            <Button>ÐŸÐµÑ€ÐµÐ¹Ñ‚Ð¸ Ð² Ð°ÐºÐºÐ°ÑƒÐ½Ñ‚</Button>
                        </Link>
                    </div>
                </div>
            </main>)
}
