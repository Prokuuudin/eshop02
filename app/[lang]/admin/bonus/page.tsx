'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminStore } from '@/lib/admin-store'
import { type User } from '@/lib/auth'
import { eurosToPoints, pointsToEuros } from '@/lib/bonus-program'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro } from '@/lib/utils'
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors'
import { useAdminLocale } from '@/lib/use-admin-locale'

type BonusHistoryRow = {
  id: string
  createdAt: string
  firstName: string
  lastName: string
  email: string
  total: number
  bonusEarned: number
  bonusSpent: number
}

type BonusStats = {
  totalEarned: number
  totalSpent: number
  ordersWithBonus: number
  history: BonusHistoryRow[]
}

const EMPTY_BONUS_STATS: BonusStats = { totalEarned: 0, totalSpent: 0, ordersWithBonus: 0, history: [] }

export default function AdminBonusPage(): React.ReactElement {
  const { t } = useTranslation()
  const { locale, l } = useAdminLocale()
  const { bonusProgram, updateBonusProgram } = useAdminStore()
  const [bonusStats, setBonusStats] = useState<BonusStats>(EMPTY_BONUS_STATS)
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
    void load().catch(() => { if (!controller.signal.aborted) { setUsers([]); reportAdminPartial(l('Настройки доступны, но список клиентов не загрузился.', 'Settings are available, but the customer list failed to load.', 'Iestatījumi ir pieejami, bet klientu sarakstu neizdevās ielādēt.'), l('Бонусная программа', 'Bonus program', 'Bonusu programma')) } })
    return () => controller.abort()
  }, [l])

  // Load the admin-authoritative config directly — the shared useAdminStore value may
  // still be the pre-hydration default when this page mounts, and editing must start
  // from the real saved settings, not a stale local guess.
  useEffect(() => {
    fetch('/api/admin/bonus-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => { if (config) setDraft(config) })
      .catch((error) => reportAdminError(error, l('Настройки бонусной программы', 'Bonus program settings', 'Bonusu programmas iestatījumi')))
  }, [l])

  useEffect(() => {
    fetch('/api/admin/bonus/stats', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((stats) => { if (stats) setBonusStats(stats) })
      .catch((error) => reportAdminError(error, l('Статистика бонусной программы', 'Bonus program statistics', 'Bonusu programmas statistika')))
  }, [l])

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
      setAdjustMsg((prev) => ({ ...prev, [userId]: l(`Баланс: ${result.user!.bonusPoints} баллов (${formatEuro(pointsToEuros(result.user!.bonusPoints), locale)})`, `Balance: ${result.user!.bonusPoints} points (${formatEuro(pointsToEuros(result.user!.bonusPoints), locale)})`, `Bilance: ${result.user!.bonusPoints} punkti (${formatEuro(pointsToEuros(result.user!.bonusPoints), locale)})`) }))
      setAdjustDelta((prev) => ({ ...prev, [userId]: '' }))
      setTimeout(() => setAdjustMsg((prev) => ({ ...prev, [userId]: '' })), 2500)
    }
  }

  const { totalEarned, totalSpent, ordersWithBonus } = bonusStats
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
    { label: l('0 баллов', '0 points', '0 punkti'),  range: (p: number) => p === 0             },
    { label: '1 – 100',   range: (p: number) => p >= 1 && p <= 100  },
    { label: '101 – 500', range: (p: number) => p >= 101 && p <= 500 },
    { label: '500+',      range: (p: number) => p > 500             },
  ].map((s) => ({ ...s, count: users.filter((u) => s.range(u.bonusPoints ?? 0)).length }))

  const top5 = [...users]
    .sort((a, b) => (b.bonusPoints ?? 0) - (a.bonusPoints ?? 0))
    .slice(0, 5)
    .filter((u) => (u.bonusPoints ?? 0) > 0)

  const bonusOrders = bonusStats.history

  return (
    <AdminGate>
      <main className="admin-bonus-page w-full py-4 space-y-6 text-foreground">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('admin.bonus.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{l('Настройка, статистика и управление балансами', 'Settings, statistics, and balance management', 'Iestatījumi, statistika un bilanču pārvaldība')}</p>
          </div>
          <Link href="/admin"><Button variant="outline">← {l('Назад', 'Back', 'Atpakaļ')}</Button></Link>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: l('Начислено всего', 'Total earned', 'Kopā nopelnīts'), value: l(`${totalEarned} баллов (${formatEuro(pointsToEuros(totalEarned), locale)})`, `${totalEarned} points (${formatEuro(pointsToEuros(totalEarned), locale)})`, `${totalEarned} punkti (${formatEuro(pointsToEuros(totalEarned), locale)})`), bg: 'bg-green-50 dark:bg-green-950/20' },
            { label: l('Списано всего', 'Total spent', 'Kopā iztērēts'), value: l(`${totalSpent} баллов (${formatEuro(pointsToEuros(totalSpent), locale)})`, `${totalSpent} points (${formatEuro(pointsToEuros(totalSpent), locale)})`, `${totalSpent} punkti (${formatEuro(pointsToEuros(totalSpent), locale)})`), bg: 'bg-rose-50 dark:bg-rose-950/20' },
            { label: l('Заказов с бонусами', 'Orders with points', 'Pasūtījumi ar punktiem'), value: ordersWithBonus, bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: l('Активных пользователей', 'Active users', 'Aktīvie lietotāji'), value: usersWithBalance, bg: 'bg-purple-50 dark:bg-purple-950/20' },
            { label: l('Суммарный баланс', 'Total balance', 'Kopējā bilance'), value: l(`${totalBalance} баллов (${formatEuro(pointsToEuros(totalBalance), locale)})`, `${totalBalance} points (${formatEuro(pointsToEuros(totalBalance), locale)})`, `${totalBalance} punkti (${formatEuro(pointsToEuros(totalBalance), locale)})`), bg: 'bg-amber-50 dark:bg-amber-950/20' },
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
            <span className="text-lg font-semibold">{l('Настройки программы', 'Program settings', 'Programmas iestatījumi')}</span>
            <span className={`text-gray-400 transition-transform duration-[280ms] ease-in-out ${settingsOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {settingsOpen && (
            <div className="ui-disclosure-in px-5 pb-5 space-y-4 border-t border-border pt-4">
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
                  <span className="block text-muted-foreground mb-1">{l('Минимум баллов для списания', 'Minimum points to redeem', 'Minimālais punktu skaits izmantošanai')}</span>
                  <Input id="admin-bonus-field-4" type="number" min={0} value={draft.minPointsToSpend}
                    onChange={(e) => setDraft((p) => ({ ...p, minPointsToSpend: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-5" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{l('Макс. баллов за один заказ (0 = без лимита)', 'Maximum points per order (0 = unlimited)', 'Maks. punkti vienā pasūtījumā (0 = bez ierobežojuma)')}</span>
                  <Input id="admin-bonus-field-5" type="number" min={0} value={draft.maxEarnPerOrder}
                    onChange={(e) => setDraft((p) => ({ ...p, maxEarnPerOrder: Number(e.target.value) }))} />
                </label>

                <label htmlFor="admin-bonus-field-6" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{l('Срок жизни баллов (дней, 0 = бессрочно)', 'Point lifetime (days, 0 = no expiry)', 'Punktu derīguma termiņš (dienas, 0 = bez termiņa)')}</span>
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
            <span className="text-lg font-semibold">{l('Предпросмотр логики', 'Logic preview', 'Loģikas priekšskatījums')}</span>
            <span className={`text-gray-400 transition-transform duration-[280ms] ease-in-out ${calcOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {calcOpen && (
            <div className="ui-disclosure-in px-5 pb-5 space-y-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {l('Введите произвольную сумму заказа — калькулятор покажет, сколько баллов получит клиент и сколько сможет потратить на следующую покупку, исходя из текущих настроек выше.', 'Enter any order amount to see how many points the customer will earn and can spend on the next purchase using the current settings.', 'Ievadiet jebkuru pasūtījuma summu, lai redzētu, cik punktu klients nopelnīs un varēs izmantot nākamajam pirkumam ar pašreizējiem iestatījumiem.')}
              </p>
              <div className="flex items-end gap-4 flex-wrap">
                <label htmlFor="admin-bonus-field-7" className="text-sm">
                  <span className="block text-muted-foreground mb-1">{l('Сумма заказа (€)', 'Order amount (€)', 'Pasūtījuma summa (€)')}</span>
                  <Input id="admin-bonus-field-7"
                    type="number"
                    min={0}
                    value={calcOrder}
                    onChange={(e) => setCalcOrder(e.target.value)}
                    placeholder={l('например, 100', 'for example, 100', 'piemēram, 100')}
                    className="w-40"
                  />
                </label>

                <div className="text-sm space-y-2 pb-0.5">
                  {!draft.enabled && (
                    <p className="text-red-600 dark:text-red-400">{l('Программа отключена', 'Program is disabled', 'Programma ir izslēgta')}</p>
                  )}
                  {draft.enabled && calcOrder && !calcEligible && (
                    <p className="text-yellow-700 dark:text-yellow-400">
                      {l(`Заказ ниже минимума €${draft.minOrderForEarn} — баллы не начисляются`, `The order is below the €${draft.minOrderForEarn} minimum — no points will be earned`, `Pasūtījums ir mazāks par €${draft.minOrderForEarn} minimumu — punkti netiks piešķirti`)}
                    </p>
                  )}
                  {draft.enabled && (
                    <>
                      <div>
                        <p className="text-green-700 dark:text-green-400 font-medium">
                          {l('Начислено:', 'Earned:', 'Nopelnīts:')} <strong>{calcEligible ? calcEarnedCapped : 0} {l('баллов', 'points', 'punkti')}</strong>
                          {draft.maxEarnPerOrder > 0 && calcEligible && calcEarned > draft.maxEarnPerOrder && (
                            <span className="ml-1 text-muted-foreground font-normal">{l(`(ограничено с ${calcEarned} баллов)`, `(capped from ${calcEarned} points)`, `(ierobežots no ${calcEarned} punktiem)`)}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          €{calcAmount} × {draft.earnRatePercent}% = {calcEarned} {l('баллов (1 балл = 1 евроцент)', 'points (1 point = 1 euro cent)', 'punkti (1 punkts = 1 eiro cents)')}{draft.maxEarnPerOrder > 0 ? l(`, лимит ${draft.maxEarnPerOrder} баллов`, `, limit ${draft.maxEarnPerOrder} points`, `, limits ${draft.maxEarnPerOrder} punkti`) : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-foreground font-medium">
                          {l('Макс. списать:', 'Maximum redeemable:', 'Maks. izmantošanai:')} <strong>{calcMaxSpend} {l('баллов', 'points', 'punkti')}</strong> (−€{pointsToEuros(calcMaxSpend).toFixed(2)})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          €{calcAmount} × {draft.maxSpendPercent}% = {calcMaxSpend} {l('баллов, 1 балл = 1 евроцент', 'points, 1 point = 1 euro cent', 'punkti, 1 punkts = 1 eiro cents')}
                          {draft.minPointsToSpend > 0 && l(` · минимум на балансе для списания: ${draft.minPointsToSpend} баллов`, ` · minimum balance to redeem: ${draft.minPointsToSpend} points`, ` · minimālā bilance izmantošanai: ${draft.minPointsToSpend} punkti`)}
                        </p>
                      </div>
                      {draft.pointsExpiryDays > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {l(`Начисленные баллы сгорят через ${draft.pointsExpiryDays} дней`, `Earned points will expire in ${draft.pointsExpiryDays} days`, `Nopelnītie punkti beigsies pēc ${draft.pointsExpiryDays} dienām`)}
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
            <span className="text-lg font-semibold">{l('Балансы пользователей', 'User balances', 'Lietotāju bilances')}</span>
            <span className={`text-gray-400 transition-transform duration-[280ms] ease-in-out ${balancesOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {balancesOpen && (
            <div className="ui-disclosure-in border-t border-border px-5 pb-5 pt-4 space-y-3">
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={l('Поиск по имени, email, телефону, карте, компании', 'Search by name, email, phone, card, or company', 'Meklēt pēc vārda, e-pasta, tālruņa, kartes vai uzņēmuma')}
                className="h-8 text-sm w-full max-w-sm"
              />
              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground">{l('Пользователи не найдены', 'No users found', 'Lietotāji nav atrasti')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">{l('Пользователь', 'User', 'Lietotājs')}</th>
                        <th className="pb-2 pr-4 font-medium">{l('Баллы', 'Points', 'Punkti')}</th>
                        <th className="pb-2 font-medium">{l('Корректировка', 'Adjustment', 'Korekcija')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-sm text-muted-foreground">{l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}</td></tr>
                      )}
                      {filteredUsers.map((user, idx) => (
                        <tr key={user.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                          <td className="py-2 pr-4">
                            <p className="font-medium">{user.name || user.email}</p>
                            {user.name && <p className="text-xs text-muted-foreground">{user.email}</p>}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`font-semibold ${(user.bonusPoints ?? 0) > 0 ? 'text-green-700 dark:text-green-400' : 'text-gray-400'}`}>
                              {user.bonusPoints ?? 0} {l('баллов', 'points', 'punkti')}
                              <span className="ml-1 font-normal opacity-70">
                                ({formatEuro(pointsToEuros(user.bonusPoints ?? 0), locale)})
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
                                placeholder={l('Кол-во баллов', 'Point amount', 'Punktu skaits')}
                                className="w-36 h-8 text-sm [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:opacity-100"
                              />
                              <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700" onClick={() => applyAdjustment(user.id, 1)}>
                                + {l('Начислить', 'Add', 'Pieskaitīt')}
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700" onClick={() => applyAdjustment(user.id, -1)}>
                                − {l('Списать', 'Deduct', 'Atņemt')}
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
            <h2 className="text-lg font-semibold mb-3">{l('Сегментация по балансу', 'Balance segmentation', 'Segmentācija pēc bilances')}</h2>
            <div className="space-y-2">
              {segments.map((s) => (
                <div key={s.label} className="rounded-lg border border-border px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <span className="font-semibold text-foreground">{s.count} {l('польз.', 'users', 'lietotāji')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">{l('Топ-5 по балансу', 'Top 5 by balance', 'Top 5 pēc bilances')}</h2>
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground">{l('Ни у кого нет баллов', 'No one has points yet', 'Nevienam vēl nav punktu')}</p>
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
                      {u.bonusPoints} {l('баллов', 'points', 'punkti')} ({formatEuro(pointsToEuros(u.bonusPoints ?? 0), locale)})
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* История операций */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">{l('История операций', 'Transaction history', 'Darījumu vēsture')}</h2>
          {bonusOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{l('Операций с бонусами пока не было', 'There have been no point transactions yet', 'Punktu darījumu vēl nav bijis')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{l('Дата', 'Date', 'Datums')}</th>
                    <th className="pb-2 pr-4 font-medium">{l('Покупатель', 'Customer', 'Pircējs')}</th>
                    <th className="pb-2 pr-4 font-medium text-right">{l('Сумма заказа', 'Order total', 'Pasūtījuma summa')}</th>
                    <th className="pb-2 pr-4 font-medium text-right">{l('Начислено', 'Earned', 'Nopelnīts')}</th>
                    <th className="pb-2 font-medium text-right">{l('Списано', 'Spent', 'Iztērēts')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusOrders.map((o, idx) => (
                    <tr key={o.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/50'}>
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString(locale)}
                      </td>
                      <td className="py-2 pr-4">
                        <p className="font-medium">{o.firstName} {o.lastName}</p>
                        <p className="text-xs text-muted-foreground">{o.email}</p>
                      </td>
                      <td className="py-2 pr-4 text-right">{formatEuro(o.total, locale)}</td>
                      <td className="py-2 pr-4 text-right">
                        {(o.bonusEarned ?? 0) > 0
                          ? <span className="text-green-700 dark:text-green-400 font-medium">
                              +{o.bonusEarned} <span className="font-normal opacity-70">({formatEuro(pointsToEuros(o.bonusEarned ?? 0), locale)})</span>
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 text-right">
                        {(o.bonusSpent ?? 0) > 0
                          ? <span className="text-rose-600 dark:text-rose-400 font-medium">
                              −{o.bonusSpent} <span className="font-normal opacity-70">({formatEuro(pointsToEuros(o.bonusSpent ?? 0), locale)})</span>
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
