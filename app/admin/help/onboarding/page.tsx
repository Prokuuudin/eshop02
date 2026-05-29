'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import AdminGate from '@/components/admin/AdminGate'

type OnboardingStep = {
  id: number
  group: 'day1' | 'week1' | 'month1'
  icon: string
  text: string
  href?: string
  linkLabel?: string
}

const steps: OnboardingStep[] = [
  // Первый день
  {
    id: 1,
    group: 'day1',
    icon: '🔑',
    text: 'Войдите в систему и смените пароль в настройках аккаунта',
    href: '/account',
    linkLabel: 'Аккаунт',
  },
  {
    id: 2,
    group: 'day1',
    icon: '📦',
    text: 'Ознакомьтесь с каталогом товаров: как выглядит карточка, где находятся цены и остатки',
    href: '/admin/products',
    linkLabel: 'Каталог',
  },
  {
    id: 3,
    group: 'day1',
    icon: '🛒',
    text: 'Изучите раздел заказов: разберитесь со статусами и как их менять вручную',
    href: '/admin/orders',
    linkLabel: 'Заказы',
  },

  // Первая неделя
  {
    id: 4,
    group: 'week1',
    icon: '🏷️',
    text: 'Создайте тестовый промокод с небольшой скидкой, чтобы понять механику',
    href: '/admin/marketing/discounts',
    linkLabel: 'Промокоды',
  },
  {
    id: 5,
    group: 'week1',
    icon: '🎨',
    text: 'Добавьте первый баннер или отредактируйте существующий на главной странице',
    href: '/admin/content/banners',
    linkLabel: 'Баннеры',
  },
  {
    id: 6,
    group: 'week1',
    icon: '🖼️',
    text: 'Загрузите изображение в медиатеку и скопируйте путь для использования в контенте',
    href: '/admin/content/media',
    linkLabel: 'Медиатека',
  },
  {
    id: 7,
    group: 'week1',
    icon: '✍️',
    text: 'Напишите черновик статьи в блоге — можно тестовый, с любым содержимым',
    href: '/admin/blog',
    linkLabel: 'Блог',
  },

  // Первый месяц
  {
    id: 8,
    group: 'month1',
    icon: '✅',
    text: 'Самостоятельно обработайте 10 реальных заказов, пройдя все статусы от «Ожидает» до «Доставлен»',
  },
  {
    id: 9,
    group: 'month1',
    icon: '💾',
    text: 'Создайте резервную копию данных магазина и убедитесь, что файл скачивается корректно',
    href: '/admin/system/backup',
    linkLabel: 'Backup',
  },
  {
    id: 10,
    group: 'month1',
    icon: '🤝',
    text: 'Изучите работу с B2B заявками: откройте существующую RFQ-заявку и отправьте тестовый quote',
    href: '/admin/rfq',
    linkLabel: 'RFQ',
  },
  {
    id: 11,
    group: 'month1',
    icon: '⭐',
    text: 'Настройте параметры бонусной программы под текущие нужды магазина',
    href: '/admin/bonus',
    linkLabel: 'Бонусы',
  },
]

const groupLabels: Record<OnboardingStep['group'], string> = {
  day1: 'Первый день',
  week1: 'Первая неделя',
  month1: 'Первый месяц',
}

const STORAGE_KEY = 'admin-onboarding-checked'

export default function AdminOnboardingPage() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as number[]
        if (Array.isArray(parsed)) {
          setChecked(new Set(parsed))
        }
      }
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [])

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // ignore
      }
      return next
    })
  }

  const reset = () => {
    setChecked(new Set())
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  const total = steps.length
  const done = checked.size
  const allDone = done === total

  const groups: OnboardingStep['group'][] = ['day1', 'week1', 'month1']

  return (
    <AdminGate>
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Онбординг сотрудника</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Чеклист для знакомства с системой — отмечайте шаги по мере выполнения
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* Progress bar */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Прогресс: {done} из {total}
            </span>
            <Button variant="outline" size="sm" onClick={reset}>
              Сбросить прогресс
            </Button>
          </div>
          <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((done / total) * 100)}%`,
                background: allDone ? '#16a34a' : '#6366f1',
              }}
            />
          </div>
          {loaded && allDone && (
            <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 font-medium">
              Отличная работа! Вы прошли все шаги онбординга. Добро пожаловать в команду!
            </div>
          )}
        </div>

        {/* Steps by group */}
        {groups.map((group) => (
          <div key={group} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {groupLabels[group]}
              </h2>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {steps
                .filter((s) => s.group === group)
                .map((step) => {
                  const isDone = checked.has(step.id)
                  return (
                    <li key={step.id} className="flex items-start gap-4 px-5 py-4">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggle(step.id)}
                        aria-label={isDone ? 'Снять отметку' : 'Отметить выполненным'}
                        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isDone
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                        }`}
                      >
                        {isDone && (
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>

                      {/* Icon + text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="text-lg leading-none mt-0.5 flex-shrink-0">{step.icon}</span>
                          <span
                            className={`text-sm leading-relaxed ${
                              isDone
                                ? 'line-through text-gray-400 dark:text-gray-500'
                                : 'text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            <span className="font-medium text-gray-500 dark:text-gray-400 mr-1">
                              {step.id}.
                            </span>
                            {step.text}
                          </span>
                        </div>
                      </div>

                      {/* Link */}
                      {step.href && step.linkLabel && (
                        <Link
                          href={step.href}
                          className="flex-shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap mt-0.5"
                        >
                          {step.linkLabel} →
                        </Link>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
      </main>
    </AdminGate>
  )
}
