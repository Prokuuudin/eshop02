'use client'

import type { LucideIcon } from 'lucide-react'

type Props = {
  eyebrow: string
  title: string
  description: string
  badgeLabel?: string
  badgeValue?: string
  icon: LucideIcon
  accentClassName?: string
}

export default function AccountPageHero({
  eyebrow,
  title,
  description,
  badgeLabel,
  badgeValue,
  icon: Icon,
  accentClassName = 'from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950/40 border-gray-200 dark:border-gray-700 bg-gradient-to-br'
}: Props) {
  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${accentClassName}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-gray-700 shadow-sm dark:bg-gray-950/40 dark:text-gray-200">
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm uppercase tracking-[0.28em] text-gray-500 dark:text-gray-400">{eyebrow}</p>
          </div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{description}</p>
        </div>

        {badgeLabel && badgeValue && (
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/40">
            <p className="text-gray-500 dark:text-gray-400">{badgeLabel}</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{badgeValue}</p>
          </div>
        )}
      </div>
    </section>
  )
}