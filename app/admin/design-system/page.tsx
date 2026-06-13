'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'

// ─── helpers ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Token({ name, bg, text, border }: { name: string; bg: string; text?: string; border?: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[100px]">
      <div
        className={`h-14 w-full rounded-lg border ${border ?? 'border-transparent'} ${bg}`}
      />
      <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-tight">{name}</p>
      {text && <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight font-mono">{text}</p>}
    </div>
  )
}

function TypeRow({ size, tailwind, weight, sample }: { size: string; tailwind: string; weight: string; sample: string }) {
  return (
    <div className="flex items-baseline gap-6 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="w-24 shrink-0">
        <span className="text-[11px] font-mono text-gray-400">{tailwind}</span>
      </div>
      <div className="w-16 shrink-0 text-[11px] text-gray-400">{size}</div>
      <div className="w-24 shrink-0 text-[11px] text-gray-400">{weight}</div>
      <p className={`${tailwind} text-foreground leading-tight`}>{sample}</p>
    </div>
  )
}

function SpacingRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-12 text-[11px] font-mono text-gray-400 shrink-0">{label}</span>
      <div className={`h-4 bg-primary/20 rounded-sm ${value}`} />
      <span className="text-[11px] text-gray-400">{label.replace('w-', '').replace('p-', '')}×4px</span>
    </div>
  )
}

// ─── page ──────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  return (
    <AdminGate>
      <main className="w-full py-4 space-y-14 text-foreground">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Eshop</p>
            <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              Визуальный справочник токенов, компонентов и паттернов проекта.
              Все элементы рендерятся из реального кода.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline" size="sm">← Админка</Button>
          </Link>
        </div>

        <Separator />

        {/* ── 1. Color Tokens ───────────────────────────────────────── */}
        <Section title="1 · Color Tokens">
          <p className="text-sm text-muted-foreground">Семантические токены Shadcn/ui — используются через CSS-переменные и Tailwind-классы.</p>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Базовые поверхности</p>
            <div className="flex flex-wrap gap-4">
              <Token name="background" bg="bg-background" text="--background" border="border-border" />
              <Token name="foreground" bg="bg-foreground" text="--foreground" />
              <Token name="card" bg="bg-card" text="--card" border="border-border" />
              <Token name="popover" bg="bg-popover" text="--popover" border="border-border" />
              <Token name="border" bg="bg-border" text="--border" />
              <Token name="input" bg="bg-input" text="--input" />
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Акцентные</p>
            <div className="flex flex-wrap gap-4">
              <Token name="primary" bg="bg-primary" text="--primary" />
              <Token name="secondary" bg="bg-secondary" text="--secondary" border="border-border" />
              <Token name="muted" bg="bg-muted" text="--muted" border="border-border" />
              <Token name="accent" bg="bg-accent" text="--accent" border="border-border" />
              <Token name="destructive" bg="bg-destructive" text="--destructive" />
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Проектные цвета (hardcoded Tailwind)</p>
            <div className="flex flex-wrap gap-4">
              <Token name="indigo-600" bg="bg-primary" text="links, focus" />
              <Token name="indigo-50" bg="bg-indigo-50" text="hero bg" border="border-border" />
              <Token name="amber-500" bg="bg-amber-500" text="bonus" />
              <Token name="amber-50" bg="bg-amber-50" text="bonus bg" border="border-border" />
              <Token name="green-600" bg="bg-green-600" text="success" />
              <Token name="red-500" bg="bg-red-500" text="error" />
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Chart tokens</p>
            <div className="flex flex-wrap gap-4">
              <Token name="chart-1" bg="bg-[hsl(var(--chart-1))]" text="--chart-1" />
              <Token name="chart-2" bg="bg-[hsl(var(--chart-2))]" text="--chart-2" />
              <Token name="chart-3" bg="bg-[hsl(var(--chart-3))]" text="--chart-3" />
              <Token name="chart-4" bg="bg-[hsl(var(--chart-4))]" text="--chart-4" />
              <Token name="chart-5" bg="bg-[hsl(var(--chart-5))]" text="--chart-5" />
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── 2. Typography ─────────────────────────────────────────── */}
        <Section title="2 · Typography">
          <p className="text-sm text-muted-foreground">Шрифт: <span className="font-mono">Inter</span> · Система: Tailwind type scale.</p>

          <Card>
            <CardContent className="pt-4 px-5 pb-5">
              <div className="mb-3 flex gap-8">
                <span className="text-[11px] font-mono text-gray-400 w-24">class</span>
                <span className="text-[11px] text-gray-400 w-16">size</span>
                <span className="text-[11px] text-gray-400 w-24">weight</span>
                <span className="text-[11px] text-gray-400">sample</span>
              </div>
              <TypeRow tailwind="text-xs"   size="12px" weight="regular" sample="Вспомогательный текст, метки" />
              <TypeRow tailwind="text-sm"   size="14px" weight="regular" sample="Основной интерфейсный текст" />
              <TypeRow tailwind="text-base" size="16px" weight="regular" sample="Текст статей и описаний" />
              <TypeRow tailwind="text-lg"   size="18px" weight="medium"  sample="Подзаголовок карточки" />
              <TypeRow tailwind="text-xl"   size="20px" weight="semibold" sample="Заголовок блока" />
              <TypeRow tailwind="text-2xl"  size="24px" weight="semibold" sample="Section heading" />
              <TypeRow tailwind="text-3xl"  size="30px" weight="semibold" sample="Page heading" />
              <TypeRow tailwind="text-4xl"  size="36px" weight="bold"    sample="Display medium" />
              <TypeRow tailwind="text-5xl"  size="48px" weight="extrabold" sample="Display large" />
              <TypeRow tailwind="text-6xl"  size="60px" weight="extrabold" sample="Hero" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {(['font-thin','font-light','font-normal','font-medium','font-semibold','font-bold','font-extrabold','font-black'] as const).map(w => (
              <div key={w} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className={`text-lg ${w} text-foreground`}>Aa</p>
                <p className="text-[10px] font-mono text-gray-400 mt-1">{w}</p>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        {/* ── 3. Spacing & Radius ───────────────────────────────────── */}
        <Section title="3 · Spacing & Radius">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            <div>
              <p className="text-xs text-gray-400 mb-3 font-medium">Spacing scale (×4px base)</p>
              <div className="space-y-2.5">
                {[
                  { w: 'w-1',  label: '1 · 4px' },
                  { w: 'w-2',  label: '2 · 8px' },
                  { w: 'w-3',  label: '3 · 12px' },
                  { w: 'w-4',  label: '4 · 16px' },
                  { w: 'w-6',  label: '6 · 24px' },
                  { w: 'w-8',  label: '8 · 32px' },
                  { w: 'w-10', label: '10 · 40px' },
                  { w: 'w-12', label: '12 · 48px' },
                  { w: 'w-16', label: '16 · 64px' },
                  { w: 'w-20', label: '20 · 80px' },
                ].map(s => (
                  <div key={s.w} className="flex items-center gap-3">
                    <span className="w-20 text-[11px] font-mono text-gray-400 shrink-0">{s.label}</span>
                    <div className={`h-3.5 rounded-sm bg-primary/25 ${s.w}`} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-3 font-medium">Border radius</p>
              <div className="space-y-3">
                {[
                  { cls: 'rounded-none', label: 'none · 0px' },
                  { cls: 'rounded-sm',   label: 'sm · calc(var(--radius) - 4px)' },
                  { cls: 'rounded-md',   label: 'md · calc(var(--radius) - 2px)' },
                  { cls: 'rounded-lg',   label: 'lg · var(--radius) = 8px' },
                  { cls: 'rounded-xl',   label: 'xl · 12px' },
                  { cls: 'rounded-2xl',  label: '2xl · 16px' },
                  { cls: 'rounded-full', label: 'full · 9999px' },
                ].map(r => (
                  <div key={r.cls} className="flex items-center gap-4">
                    <div className={`w-12 h-8 bg-primary/20 border border-primary/30 shrink-0 ${r.cls}`} />
                    <span className="text-[11px] font-mono text-gray-500">{r.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 mt-6 mb-3 font-medium">Shadows</p>
              <div className="space-y-3">
                {[
                  { cls: 'shadow-sm',  label: 'shadow-sm' },
                  { cls: 'shadow',     label: 'shadow' },
                  { cls: 'shadow-md',  label: 'shadow-md' },
                  { cls: 'shadow-lg',  label: 'shadow-lg' },
                  { cls: 'shadow-xl',  label: 'shadow-xl' },
                ].map(s => (
                  <div key={s.cls} className="flex items-center gap-4">
                    <div className={`w-12 h-8 bg-white dark:bg-gray-800 rounded-lg shrink-0 ${s.cls}`} />
                    <span className="text-[11px] font-mono text-gray-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </Section>

        <Separator />

        {/* ── 4. Buttons ────────────────────────────────────────────── */}
        <Section title="4 · Buttons">

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Variants</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Sizes</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="icon">✦</Button>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">States</p>
            <div className="flex flex-wrap gap-3 items-center">
              <Button>Normal</Button>
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>Outline disabled</Button>
            </div>
          </div>

        </Section>

        <Separator />

        {/* ── 5. Badges ─────────────────────────────────────────────── */}
        <Section title="5 · Badges">
          <div className="flex flex-wrap gap-3 items-center">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
            {/* Custom project badges */}
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Bonus</span>
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-primary">Новинка</span>
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">В наличии</span>
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Нет в наличии</span>
          </div>
        </Section>

        <Separator />

        {/* ── 6. Form Elements ──────────────────────────────────────── */}
        <Section title="6 · Form Elements">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            <div className="space-y-3">
              <p className="text-xs text-gray-400 font-medium">Input states</p>
              <div className="space-y-2">
                <Input placeholder="Default placeholder" />
                <Input defaultValue="Filled value" />
                <Input disabled placeholder="Disabled" />
                <Input
                  className="border-red-400 focus-visible:ring-red-400"
                  defaultValue="Error state"
                  aria-invalid
                />
                <p className="text-xs text-red-500">Поле обязательно для заполнения</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-400 font-medium">Textarea</p>
              <Textarea placeholder="Введите текст..." className="min-h-[120px]" />
              <Textarea disabled placeholder="Disabled textarea" />
            </div>

          </div>

          <div>
            <p className="text-xs text-gray-400 mb-3 font-medium">Controls</p>
            <div className="flex flex-wrap gap-6 items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox id="ds-check-1" />
                <span>Checkbox unchecked</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox id="ds-check-2" defaultChecked />
                <span>Checkbox checked</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch id="ds-switch-1" />
                <span>Switch off</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch id="ds-switch-2" defaultChecked />
                <span>Switch on</span>
              </label>
            </div>
          </div>

        </Section>

        <Separator />

        {/* ── 7. Cards ──────────────────────────────────────────────── */}
        <Section title="7 · Cards">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            <Card>
              <CardHeader>
                <CardTitle>Базовая карточка</CardTitle>
                <CardDescription>Shadcn Card · bg-card · border-border</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Контент карточки. Используется для группировки связанного контента.</p>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>С тенью shadow-md</CardTitle>
                <CardDescription>Elevated surface</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Badge>tag one</Badge>
                  <Badge variant="outline">tag two</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Акцентная карточка</CardTitle>
                <CardDescription>border-primary · bg-primary/5</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm">Действие</Button>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle>Amber · Bonus</CardTitle>
                <CardDescription>Используется в BonusSection</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-2xl">⭐</span>
              </CardContent>
            </Card>

            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader>
                <CardTitle>Destructive</CardTitle>
                <CardDescription>Ошибки, предупреждения</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" size="sm">Удалить</Button>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
              <CardHeader>
                <CardTitle>Success</CardTitle>
                <CardDescription>Успешные действия</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-green-700 dark:text-green-300">Операция выполнена успешно.</p>
              </CardContent>
            </Card>

          </div>
        </Section>

        <Separator />

        {/* ── 8. Feedback States ────────────────────────────────────── */}
        <Section title="8 · Feedback & Alerts">
          <div className="space-y-2">
            <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
              ✓ Успех — операция выполнена.
            </div>
            <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
              ⚠ Предупреждение — обратите внимание.
            </div>
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
              ✕ Ошибка — что-то пошло не так.
            </div>
            <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
              ℹ Информация — нейтральное сообщение.
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
              — Нейтральная подсказка без цветового акцента.
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── 9. Skeleton / Loading ─────────────────────────────────── */}
        <Section title="9 · Skeleton & Loading">
          <div className="space-y-3 max-w-sm">
            <div className="h-5 w-3/4 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-4 w-full rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-4 w-5/6 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-32 w-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="flex gap-3">
              <div className="h-9 w-24 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-9 w-20 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="text-xs text-gray-400 dark:text-gray-600 pb-6">
          Eshop Design System · Tailwind CSS + Shadcn/ui · Inter · generated from live components
        </div>

      </main>
    </AdminGate>
  )
}
