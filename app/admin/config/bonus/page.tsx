'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAdminStore } from '@/lib/admin-store'

const SELECT_CLASS =
  'w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm'

export default function AdminBonusProgramPage() {
  const { bonusProgram, updateBonusProgram } = useAdminStore()

  const [enabled, setEnabled] = React.useState<boolean>(bonusProgram.enabled)
  const [earnRate, setEarnRate] = React.useState<string>(String(bonusProgram.earnRatePercent))
  const [maxSpend, setMaxSpend] = React.useState<string>(String(bonusProgram.maxSpendPercent))
  const [minOrder, setMinOrder] = React.useState<string>(String(bonusProgram.minOrderForEarn))
  const [message, setMessage] = React.useState<string>('')

  const earnRateNum = parseFloat(earnRate) || 0
  const maxSpendNum = parseFloat(maxSpend) || 0
  const minOrderNum = parseFloat(minOrder) || 0

  const handleSave = () => {
    updateBonusProgram({
      enabled,
      earnRatePercent: earnRateNum,
      maxSpendPercent: maxSpendNum,
      minOrderForEarn: minOrderNum,
    })
    setMessage('Сохранено')
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Бонусная программа
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Настройте правила начисления и использования бонусных баллов.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* Success message */}
        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Настройки</h2>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Статус программы
              </label>
              <select
                className={SELECT_CLASS}
                value={enabled ? 'yes' : 'no'}
                onChange={(e) => setEnabled(e.target.value === 'yes')}
              >
                <option value="yes">Включена</option>
                <option value="no">Отключена</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Процент начисления бонусов (%)
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={earnRate}
                onChange={(e) => setEarnRate(e.target.value)}
                placeholder="Например: 5"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Сколько процентов от суммы заказа начисляется бонусами. Диапазон: 0–100.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Максимальный процент оплаты бонусами (%)
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={maxSpend}
                onChange={(e) => setMaxSpend(e.target.value)}
                placeholder="Например: 50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Максимальная доля заказа, которую можно оплатить бонусами. Диапазон: 0–100.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Минимальная сумма заказа для начисления (€)
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                placeholder="Например: 20"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Бонусы начисляются только при заказах на эту сумму и выше. 0 — без ограничений.
              </p>
            </div>

            <Button onClick={handleSave} className="w-full">
              Сохранить
            </Button>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Превью: как работает программа
            </h2>

            {!enabled ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                Бонусная программа отключена. Бонусы не начисляются и не принимаются к оплате.
              </div>
            ) : (
              <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-3 py-2">
                  <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">Начисление бонусов</p>
                  {minOrderNum > 0 ? (
                    <p>
                      При заказе от <span className="font-semibold">€{minOrderNum.toFixed(2)}</span> клиент
                      получает <span className="font-semibold">{earnRateNum}%</span> от суммы заказа в виде бонусов.
                    </p>
                  ) : (
                    <p>
                      С любого заказа клиент получает{' '}
                      <span className="font-semibold">{earnRateNum}%</span> от суммы заказа в виде бонусов.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    Пример: заказ на €100 → +{(100 * earnRateNum / 100).toFixed(2)} бонуса
                  </p>
                </div>

                <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2">
                  <p className="font-medium text-green-800 dark:text-green-300 mb-1">Списание бонусов</p>
                  <p>
                    Клиент может оплатить бонусами до{' '}
                    <span className="font-semibold">{maxSpendNum}%</span> стоимости заказа.
                  </p>
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    Пример: заказ на €100 → можно потратить до {(100 * maxSpendNum / 100).toFixed(2)} бонуса
                  </p>
                </div>

                <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Параметры</p>
                  <p>Начисление: {earnRateNum}% от суммы заказа</p>
                  <p>Макс. списание: {maxSpendNum}% от суммы заказа</p>
                  {minOrderNum > 0 && <p>Минимальный заказ для начисления: €{minOrderNum.toFixed(2)}</p>}
                  {minOrderNum === 0 && <p>Минимальный заказ для начисления: без ограничений</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AdminGate>
  )
}
