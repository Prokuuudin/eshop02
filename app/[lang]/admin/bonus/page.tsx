'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminStore } from '@/lib/admin-store'
import { useOrders } from '@/lib/orders-store'
import { useAdminOrdersSync } from '@/lib/use-admin-orders-sync'
import { type User } from '@/lib/auth'
import { eurosToPoints, pointsToEuros } from '@/lib/bonus-program'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro } from '@/lib/utils'
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors'

export default function AdminBonusPage(): React.ReactElement {
  useAdminOrdersSync()
  const { t } = useTranslation()
  const { bonusProgram, updateBonusProgram } = useAdminStore()
  const { orders } = useOrders()
  const [draft, setDraft] = useState(bonusProgram)
  const [saved, setSaved] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [adjustDelta, setAdjustDelta] = useState<Record<string, string>>({})
  const [adjustMsg, setAdjustMsg] = useState<Record<string, string>>({})

  const [calcOrder, setCalcOrder] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [balancesOpen, setBalancesOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      const loaded: User[] = []
      let skip = 0
      for (;;) {
        const response = await fetch(`/api/admin/users?skip=${skip}&take=100`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`users_load_failed:${response.status}`)
        const payload = await response.json() as { users?: Array<Omit<User, 'password'>>; total?: number }
        const page = (payload.users ?? []).map((user) => ({ ...user, password: '' }))
        loaded.push(...page)
        if (loaded.length >= (payload.total ?? loaded.length) || page.length < 100) break
        skip += page.length
      }
      setUsers(loaded.filter((user) => user.platformRole !== 'admin'))
    }
    void load().catch(() => { if (!controller.signal.aborted) { setUsers([]); reportAdminPartial('Настройки доступны, но список клиентов не загрузился.', 'Бонусная программа') } })
    return () => controller.abort()
  }, [])

  // Load the admin-authoritative config directly — the shared useAdminStore value may
  // still be the pre-hydration default when this page mounts, and editing must start
  // from the real saved settings, not a stale local guess.
  useEffect(() => {
    fetch('/api/admin/bonus-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => { if (config) setDraft(config) })
      .catch((error) => reportAdminError(error, 'Настройки бонусной программы'))
  }, [])

  const saveSettings = async () => {
    try {
      const authoritative = await updateBonusProgram(draft)
      setDraft(authoritative)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      setSaved(false)
    }
  }

  const applyAdjustment = async (userId: string, sign: 1 | -1) => {
    const raw = adjustDelta[userId] ?? ''
    const amount = parseInt(raw, 10)
    if (!raw || isNaN(amount) || amount <= 0) return

    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/bonus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: sign * amount }),
    })
    const result = await response.json().catch(() => null) as { user?: { bonusPoints: number } } | null
    if (response.ok && result?.user) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, bonusPoints: result.user!.bonusPoints } : u))
      setAdjustMsg((prev) => ({ ...prev, [userId]: `Баланс: ${result.user!.bonusPoints} баллов (${formatEuro(pointsToEuros(result.user!.bonusPoints), 'ru-RU')})` }))
      setAdjustDelta((prev) => ({ ...prev, [userId]: '' }))
      setTimeout(() => setAdjustMsg((prev) => ({ ...prev, [userId]: '' })), 2500)
    }
  }

  const totalEarned = orders.reduce((s, o) => s + (o.bonusEarned ?? 0), 0)
  const totalSpent = orders.reduce((s, o) => s + (o.bonusSpent ?? 0), 0)
  const ordersWithBonus = orders.filter((o) => (o.bonusEarned ?? 0) > 0 || (o.bonusSpent ?? 0) > 0).length
  const usersWithBalance = users.filter((u) => (u.bonusPoints ?? 0) > 0).length
  const totalBalance = users.reduce((s, u) => s + (u.bonusPoints ?? 0), 0)

  const filteredUsers = userSearch.trim()
    ? users.filter((u) => {
        const q = userSearch.trim().toLowerCase()
        return (
          u.name?.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.cardNumber?.toLowerCase().includes(q) ||
          u.companyName?.toLowerCase().includes(q)
        )
      })
    : users

  const calcAmount = parseFloat(calcOrder) || 0
  // Баллы: евро-эквивалент по курсу 1 балл = 1 цент
  const calcEarned = eurosToPoints(calcAmount * (draft.earnRatePercent / 100))
  const calcEarnedCapped = draft.maxEarnPerOrder > 0 ? Math.min(calcEarned, draft.maxEarnPerOrder) : calcEarned
  const calcEligible = calcAmount >= draft.minOrderForEarn
  const calcMaxSpend = eurosToPoints(calcAmount * (draft.maxSpendPercent / 100))

  const segments = [
    { label: '0 баллов',  range: (p: number) => p === 0             },
    { label: '1 – 100',   range: (p: number) => p >= 1 && p <= 100  },
    { label: '101 – 500', range: (p: number) => p >= 101 && p <= 500 },
    { label: '500+',      range: (p: number) => p > 500             },
  ].map((s) => ({ ...s, count: users.filter((u) => s.range(u.bonusPoints ?? 0)).length }))

  const top5 = [...users]
    .sort((a, b) => (b.bonusPoints ?? 0) - (a.bonusPoints ?? 0))
    .slice(0, 5)
    .filter((u) => (u.bonusPoints ?? 0) > 0)

  const bonusOrders = [...orders]
    .filter((o) => (o.bonusEarned ?? 0) > 0 || (o.bonusSpent ?? 0) > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <AdminGate>
      <main className="admin-bonus-page w-full py-4 space-y-6 text-foreground">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('admin.bonus.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Настройка, статистика и управление балансами</p>
          </div>
          <Link href="/admin"><Button variant="outline">← Назад</Button></Link>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Начислено всего', value: `${totalEarned} баллов (${formatEuro(pointsToEuros(totalEarned), 'ru-RU')})`, bg: 'bg-green-50 dark:bg-green-950/20' },
            { label: 'Списано всего', value: `${totalSpent} баллов (${formatEuro(pointsToEuros(totalSpent), 'ru-RU')})`, bg: 'bg-rose-50 dark:bg-rose-950/20' },
            { label: 'Заказов с бонусами', value: ordersWithBonus, bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: 'Активных пользователей', value: usersWithBalance, bg: 'bg-purple-50 dark:bg-purple-950/20' },
            { label: 'Суммарный баланс', value: `${totalBalance} баллов (${formatEuro(pointsToEuros(totalBalance), 'ru-RU')})`, bg: 'bg-amber-50 dark:bg-amber-950/20' },
          ].map(({ label, value, bg }) => (
            <div key={label} className={`${bg} rounded-xl border border-border p-4 shadow-sm`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* Настройки */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-lg font-semibold">Настройки программы</span>
            <span className={`text-gray-400 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {settingsOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="block text-muted-foreground mb-1">{t('admin.bonus.enabled')}</span>
                  <Select value={draft.enabled ? 'yes' : 'no'} onValueChange={(v) => setDraft((p) => ({ ...p, enabled: v === 'yes' }))}>
                    <SelectTrigger className="w-full rounded border border-border bg-card px-3 py-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t('common.yes')}</SelectItem>
                      <SelectItem value="no">{t('common.no')}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label htmlFor="admin-bonus-field-1" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{t('admin.bonus.earnRate')} (%)</span>
                  <Input id="admin-bonus-field-1" type="number" min={0} max={100} step={0.1} value={draft.earnRatePercent}
                    onChange={(e) => setDraft((p) => ({ ...p, earnRatePercent: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-2" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{t('admin.bonus.maxSpend')} (%)</span>
                  <Input id="admin-bonus-field-2" type="number" min={0} max={100} value={draft.maxSpendPercent}
                    onChange={(e) => setDraft((p) => ({ ...p, maxSpendPercent: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-3" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{t('admin.bonus.minOrderForEarn')} (€)</span>
                  <Input id="admin-bonus-field-3" type="number" min={0} value={draft.minOrderForEarn}
                    onChange={(e) => setDraft((p) => ({ ...p, minOrderForEarn: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-4" className="text-sm">
                  <span className="block text-muted-foreground mb-1">Минимум баллов для списания</span>
                  <Input id="admin-bonus-field-4" type="number" min={0} value={draft.minPointsToSpend}
                    onChange={(e) => setDraft((p) => ({ ...p, minPointsToSpend: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-5" className="text-sm">
                  <span className="block text-muted-foreground mb-1">Макс. баллов за один заказ (0 = без лимита)</span>
                  <Input id="admin-bonus-field-5" type="number" min={0} value={draft.maxEarnPerOrder}
                    onChange={(e) => setDraft((p) => ({ ...p, maxEarnPerOrder: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-6" className="text-sm">
                  <span className="block text-muted-foreground mb-1">Срок жизни баллов (дней, 0 = бессрочно)</span>
                  <Input id="admin-bonus-field-6" type="number" min={0} max={3650} value={draft.pointsExpiryDays}
                    onChange={(e) => setDraft((p) => ({ ...p, pointsExpiryDays: Number(e.target.value) }))} />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={saveSettings}>{t('common.save')}</Button>
                {saved && <span className="text-sm text-green-700 dark:text-green-400">{t('admin.bonus.saved')}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Калькулятор */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setCalcOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-lg font-semibold">Предпросмотр логики</span>
            <span className={`text-gray-400 transition-transform duration-200 ${calcOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {calcOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Введите произвольную сумму заказа — калькулятор покажет, сколько баллов получит клиент и сколько сможет потратить на следующую покупку, исходя из текущих настроек выше.
              </p>
              <div className="flex items-end gap-4 flex-wrap">
                <label htmlFor="admin-bonus-field-7" className="text-sm">
                  <span className="block text-muted-foreground mb-1">Сумма заказа (€)</span>
                  <Input id="admin-bonus-field-7"
                    type="number"
                    min={0}
                    value={calcOrder}
                    onChange={(e) => setCalcOrder(e.target.value)}
                    placeholder="например, 100"
                    className="w-40"
                  />
                </label>

                <div className="text-sm space-y-2 pb-0.5">
                  {!draft.enabled && (
                    <p className="text-red-600 dark:text-red-400">Программа отключена</p>
                  )}
                  {draft.enabled && calcOrder && !calcEligible && (
                    <p className="text-yellow-700 dark:text-yellow-400">
                      Заказ ниже минимума €{draft.minOrderForEarn} — баллы не начисляются
                    </p>
                  )}
                  {draft.enabled && (
                    <>
                      <div>
                        <p className="text-green-700 dark:text-green-400 font-medium">
                          Начислено: <strong>{calcEligible ? calcEarnedCapped : 0} баллов</strong>
                          {draft.maxEarnPerOrder > 0 && calcEligible && calcEarned > draft.maxEarnPerOrder && (
                            <span className="ml-1 text-muted-foreground font-normal">(обрезано с {calcEarned} баллов лимитом)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          €{calcAmount} × {draft.earnRatePercent}% = {calcEarned} баллов (1 балл = 1 евроцент){draft.maxEarnPerOrder > 0 ? `, лимит ${draft.maxEarnPerOrder} баллов` : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-foreground font-medium">
                          Макс. списать: <strong>{calcMaxSpend} баллов</strong> (−€{pointsToEuros(calcMaxSpend).toFixed(2)})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          €{calcAmount} × {draft.maxSpendPercent}% = {calcMaxSpend} баллов, 1 балл = 1 евроцент
                          {draft.minPointsToSpend > 0 && ` · минимум на балансе для списания: ${draft.minPointsToSpend} баллов`}
                        </p>
                      </div>
                      {draft.pointsExpiryDays > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Начисленные баллы сгорят через {draft.pointsExpiryDays} дней
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Балансы пользователей */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setBalancesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-lg font-semibold">Балансы пользователей</span>
            <span className={`text-gray-400 transition-transform duration-200 ${balancesOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {balancesOpen && (
            <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск по имени, email, телефону, карте, компании"
                className="h-8 text-sm w-full max-w-sm"
              />
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пользователи не найдены</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Пользователь</th>
                        <th className="pb-2 pr-4 font-medium">Баллы</th>
                        <th className="pb-2 font-medium">Корректировка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-sm text-muted-foreground">Ничего не найдено</td></tr>
                      )}
                      {filteredUsers.map((user, idx) => (
                        <tr key={user.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="py-2 pr-4">
                            <p className="font-medium">{user.name || user.email}</p>
                            {user.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`font-semibold ${(user.bonusPoints ?? 0) > 0 ? 'text-green-700 dark:text-green-400' : 'text-gray-400'}`}>
                              {user.bonusPoints ?? 0} баллов
                              <span className="ml-1 font-normal opacity-70">
                                ({formatEuro(pointsToEuros(user.bonusPoints ?? 0), 'ru-RU')})
                              </span>
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Input
                                type="number"
                                min={1}
                                value={adjustDelta[user.id] ?? ''}
                                onChange={(e) => setAdjustDelta((p) => ({ ...p, [user.id]: e.target.value }))}
                                placeholder="Кол-во баллов"
                                className="w-36 h-8 text-sm [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                              />
                              <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700" onClick={() => applyAdjustment(user.id, 1)}>
                                + Начислить
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700" onClick={() => applyAdjustment(user.id, -1)}>
                                − Списать
                              </Button>
                              {adjustMsg[user.id] && (
                                <span className="text-xs text-green-700 dark:text-green-400">{adjustMsg[user.id]}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Сегментация + Топ-5 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Сегментация по балансу</h2>
            <div className="space-y-2">
              {segments.map((s) => (
                <div key={s.label} className="rounded-lg border border-border px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground">{s.count} польз.</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Топ-5 по балансу</h2>
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ни у кого нет баллов</p>
            ) : (
              <ol className="space-y-2">
                {top5.map((u, i) => (
                  <li key={u.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name || u.email}</p>
                      {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                    </div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400 shrink-0">
                      {u.bonusPoints} баллов ({formatEuro(pointsToEuros(u.bonusPoints ?? 0), 'ru-RU')})
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* История операций */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">История операций</h2>
          {bonusOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Операций с бонусами пока не было</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Дата</th>
                    <th className="pb-2 pr-4 font-medium">Покупатель</th>
                    <th className="pb-2 pr-4 font-medium text-right">Сумма заказа</th>
                    <th className="pb-2 pr-4 font-medium text-right">Начислено</th>
                    <th className="pb-2 font-medium text-right">Списано</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusOrders.map((o, idx) => (
                    <tr key={o.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="py-2 pr-4">
                        <p className="font-medium">{o.firstName} {o.lastName}</p>
                        <p className="text-xs text-muted-foreground">{o.email}</p>
                      </td>
                      <td className="py-2 pr-4 text-right">{formatEuro(o.total, 'ru-RU')}</td>
                      <td className="py-2 pr-4 text-right">
                        {(o.bonusEarned ?? 0) > 0
                          ? <span className="text-green-700 dark:text-green-400 font-medium">
                              +{o.bonusEarned} <span className="font-normal opacity-70">({formatEuro(pointsToEuros(o.bonusEarned ?? 0), 'ru-RU')})</span>
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 text-right">
                        {(o.bonusSpent ?? 0) > 0
                          ? <span className="text-rose-600 dark:text-rose-400 font-medium">
                              −{o.bonusSpent} <span className="font-normal opacity-70">({formatEuro(pointsToEuros(o.bonusSpent ?? 0), 'ru-RU')})</span>
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </AdminGate>
  )
}
