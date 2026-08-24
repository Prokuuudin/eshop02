'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { Section, Token, TypeRow } from './DesignSystemPrimitives';

// ─── page ──────────────────────────────────────────────────────────────────

export default function DesignSystemPage(): React.ReactElement {
    const { l } = useAdminLocale();
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-14 text-foreground">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                            HairShop-Pro
                        </p>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {l('Дизайн-система', 'Design system', 'Dizaina sistēma')}
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                            {l(
                                'Визуальный справочник токенов, компонентов и паттернов проекта. Все элементы рендерятся из реального кода.',
                                'A visual reference for the project’s tokens, components, and patterns. All elements are rendered from production code.',
                                'Projekta marķieru, komponentu un šablonu vizuālā rokasgrāmata. Visi elementi tiek renderēti no reālā koda.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline" size="sm">
                            ← {l('Админка', 'Admin', 'Administrēšana')}
                        </Button>
                    </Link>
                </div>

                <Separator />

                {/* ── 1. Color Tokens ───────────────────────────────────────── */}
                <Section title={l('1 · Цветовые токены', '1 · Color tokens', '1 · Krāsu marķieri')}>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Семантические токены Shadcn/ui используются через CSS-переменные и классы Tailwind.',
                            'Semantic Shadcn/ui tokens are used through CSS variables and Tailwind classes.',
                            'Shadcn/ui semantiskie marķieri tiek izmantoti ar CSS mainīgajiem un Tailwind klasēm.'
                        )}
                    </p>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Базовые поверхности', 'Base surfaces', 'Pamata virsmas')}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Token
                                name="background"
                                bg="bg-background"
                                text="--background"
                                border="border-border"
                            />
                            <Token name="foreground" bg="bg-foreground" text="--foreground" />
                            <Token name="card" bg="bg-card" text="--card" border="border-border" />
                            <Token
                                name="popover"
                                bg="bg-popover"
                                text="--popover"
                                border="border-border"
                            />
                            <Token name="border" bg="bg-border" text="--border" />
                            <Token name="input" bg="bg-input" text="--input" />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Акцентные', 'Accent colors', 'Akcenta krāsas')}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Token name="primary" bg="bg-primary" text="--primary" />
                            <Token name="brand" bg="bg-brand" text="--brand · #0088C4" />
                            <Token
                                name="brand foreground"
                                bg="bg-brand-foreground"
                                text="--brand-foreground"
                                border="border-border"
                            />
                            <Token
                                name="secondary"
                                bg="bg-secondary"
                                text="--secondary"
                                border="border-border"
                            />
                            <Token
                                name="muted"
                                bg="bg-muted"
                                text="--muted"
                                border="border-border"
                            />
                            <Token
                                name="accent"
                                bg="bg-accent"
                                text="--accent"
                                border="border-border"
                            />
                            <Token name="destructive" bg="bg-destructive" text="--destructive" />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l(
                                'Дополнительные проектные цвета',
                                'Additional project colors',
                                'Papildu projekta krāsas'
                            )}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Token
                                name="primary/5"
                                bg="bg-primary/5"
                                text="hero bg"
                                border="border-border"
                            />
                            <Token
                                name="indigo-600"
                                bg="bg-indigo-600"
                                text={`CTA «${l('В корзину', 'Add to cart', 'Pievienot grozam')}»`}
                            />
                            <Token
                                name="pink-600"
                                bg="bg-pink-600"
                                text={`CTA «${l(
                                    'В избранное',
                                    'Add to favorites',
                                    'Pievienot izlasei'
                                )}»`}
                            />
                            <Token name="amber-500" bg="bg-amber-500" text="bonus" />
                            <Token
                                name="amber-50"
                                bg="bg-amber-50"
                                text="bonus bg"
                                border="border-border"
                            />
                            <Token name="green-600" bg="bg-green-600" text="success" />
                            <Token name="red-500" bg="bg-red-500" text="error" />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Токены графиков', 'Chart tokens', 'Diagrammu marķieri')}
                        </p>
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
                <Section title={l('2 · Типографика', '2 · Typography', '2 · Tipogrāfija')}>
                    <p className="text-sm text-muted-foreground">
                        {l('Шрифт:', 'Font:', 'Fonts:')}{' '}
                        <span className="font-mono">Instrument Sans</span> (
                        {l('переменные', 'variables', 'mainīgie')}{' '}
                        <span className="font-mono">--font-instrument-sans</span> →{' '}
                        <span className="font-mono">--font-sans</span>) ·{' '}
                        {l(
                            'Система: шкала шрифтов Tailwind.',
                            'System: Tailwind type scale.',
                            'Sistēma: Tailwind fontu skala.'
                        )}
                    </p>

                    <Card>
                        <CardContent className="pt-4 px-5 pb-5">
                            <div className="mb-3 flex gap-8">
                                <span className="text-[11px] font-mono text-muted-foreground w-24">
                                    class
                                </span>
                                <span className="text-[11px] text-muted-foreground w-16">size</span>
                                <span className="text-[11px] text-muted-foreground w-24">
                                    weight
                                </span>
                                <span className="text-[11px] text-muted-foreground">sample</span>
                            </div>
                            <TypeRow
                                tailwind="text-xs"
                                size="12px"
                                weight="regular"
                                sample={l(
                                    'Вспомогательный текст, метки',
                                    'Helper text and labels',
                                    'Palīgteksts un etiķetes'
                                )}
                            />
                            <TypeRow
                                tailwind="text-sm"
                                size="14px"
                                weight="regular"
                                sample={l(
                                    'Основной интерфейсный текст',
                                    'Primary interface text',
                                    'Galvenais saskarnes teksts'
                                )}
                            />
                            <TypeRow
                                tailwind="text-base"
                                size="16px"
                                weight="regular"
                                sample={l(
                                    'Текст статей и описаний',
                                    'Article and description text',
                                    'Rakstu un aprakstu teksts'
                                )}
                            />
                            <TypeRow
                                tailwind="text-lg"
                                size="18px"
                                weight="medium"
                                sample={l(
                                    'Подзаголовок карточки',
                                    'Card subtitle',
                                    'Kartītes apakšvirsraksts'
                                )}
                            />
                            <TypeRow
                                tailwind="text-xl"
                                size="20px"
                                weight="semibold"
                                sample={l('Заголовок блока', 'Block heading', 'Bloka virsraksts')}
                            />
                            <TypeRow
                                tailwind="text-2xl"
                                size="24px"
                                weight="semibold"
                                sample="Section heading"
                            />
                            <TypeRow
                                tailwind="text-3xl"
                                size="30px"
                                weight="semibold"
                                sample="Page heading"
                            />
                            <TypeRow
                                tailwind="text-4xl"
                                size="36px"
                                weight="bold"
                                sample="Display medium"
                            />
                            <TypeRow
                                tailwind="text-5xl"
                                size="48px"
                                weight="extrabold"
                                sample="Display large"
                            />
                            <TypeRow
                                tailwind="text-6xl"
                                size="60px"
                                weight="extrabold"
                                sample="Hero"
                            />
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {(
                            [
                                'font-thin',
                                'font-light',
                                'font-normal',
                                'font-medium',
                                'font-semibold',
                                'font-bold',
                                'font-extrabold',
                                'font-black',
                            ] as const
                        ).map((w) => (
                            <div
                                key={w}
                                className="rounded-lg border border-border bg-card p-3 text-center"
                            >
                                <p className={`text-lg ${w} text-foreground`}>Aa</p>
                                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                                    {w}
                                </p>
                            </div>
                        ))}
                    </div>
                </Section>

                <Separator />

                {/* ── 3. Spacing & Radius ───────────────────────────────────── */}
                <Section
                    title={l(
                        '3 · Отступы и скругления',
                        '3 · Spacing & radius',
                        '3 · Atstarpes un noapaļojumi'
                    )}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <p className="text-xs text-muted-foreground mb-3 font-medium">
                                {l(
                                    'Шкала отступов (база ×4 px)',
                                    'Spacing scale (×4 px base)',
                                    'Atstarpju skala (×4 px bāze)'
                                )}
                            </p>
                            <div className="space-y-2.5">
                                {[
                                    { w: 'w-1', label: '1 · 4px' },
                                    { w: 'w-2', label: '2 · 8px' },
                                    { w: 'w-3', label: '3 · 12px' },
                                    { w: 'w-4', label: '4 · 16px' },
                                    { w: 'w-6', label: '6 · 24px' },
                                    { w: 'w-8', label: '8 · 32px' },
                                    { w: 'w-10', label: '10 · 40px' },
                                    { w: 'w-12', label: '12 · 48px' },
                                    { w: 'w-16', label: '16 · 64px' },
                                    { w: 'w-20', label: '20 · 80px' },
                                ].map((s) => (
                                    <div key={s.w} className="flex items-center gap-3">
                                        <span className="w-20 text-[11px] font-mono text-muted-foreground shrink-0">
                                            {s.label}
                                        </span>
                                        <div className={`h-3.5 rounded-sm bg-primary/25 ${s.w}`} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground mb-3 font-medium">
                                {l('Радиус скругления', 'Border radius', 'Stūru noapaļojums')}
                            </p>
                            <div className="space-y-3">
                                {[
                                    { cls: 'rounded-none', label: 'none · 0px' },
                                    { cls: 'rounded-sm', label: 'sm · calc(var(--radius) - 4px)' },
                                    { cls: 'rounded-md', label: 'md · calc(var(--radius) - 2px)' },
                                    { cls: 'rounded-lg', label: 'lg · var(--radius) = 8px' },
                                    { cls: 'rounded-xl', label: 'xl · 12px' },
                                    { cls: 'rounded-2xl', label: '2xl · 16px' },
                                    { cls: 'rounded-full', label: 'full · 9999px' },
                                ].map((r) => (
                                    <div key={r.cls} className="flex items-center gap-4">
                                        <div
                                            className={`w-12 h-8 bg-primary/20 border border-primary/30 shrink-0 ${r.cls}`}
                                        />
                                        <span className="text-[11px] font-mono text-muted-foreground">
                                            {r.label}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <p className="text-xs text-muted-foreground mt-6 mb-3 font-medium">
                                {l('Тени', 'Shadows', 'Ēnas')}
                            </p>
                            <div className="space-y-3">
                                {[
                                    { cls: 'shadow-sm', label: 'shadow-sm' },
                                    { cls: 'shadow', label: 'shadow' },
                                    { cls: 'shadow-md', label: 'shadow-md' },
                                    { cls: 'shadow-lg', label: 'shadow-lg' },
                                    { cls: 'shadow-xl', label: 'shadow-xl' },
                                ].map((s) => (
                                    <div key={s.cls} className="flex items-center gap-4">
                                        <div
                                            className={`w-12 h-8 bg-card rounded-lg shrink-0 ${s.cls}`}
                                        />
                                        <span className="text-[11px] font-mono text-muted-foreground">
                                            {s.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>

                <Separator />

                {/* ── 4. Buttons ────────────────────────────────────────────── */}
                <Section title={l('4 · Кнопки', '4 · Buttons', '4 · Pogas')}>
                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Варианты', 'Variants', 'Varianti')}
                        </p>
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
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Размеры', 'Sizes', 'Izmēri')}
                        </p>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Button size="sm">Small</Button>
                            <Button size="default">Default</Button>
                            <Button size="lg">Large</Button>
                            <Button size="icon" aria-label="icon">
                                ✦
                            </Button>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Состояния', 'States', 'Stāvokļi')}
                        </p>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Button>{l('Обычная', 'Normal', 'Parasta')}</Button>
                            <Button disabled>{l('Отключена', 'Disabled', 'Atspējota')}</Button>
                            <Button variant="outline" disabled>
                                {l(
                                    'Контурная отключена',
                                    'Outline disabled',
                                    'Atspējota kontūrpoga'
                                )}
                            </Button>
                        </div>
                    </div>
                </Section>

                <Separator />

                {/* ── 5. Badges ─────────────────────────────────────────────── */}
                <Section title={l('5 · Метки', '5 · Badges', '5 · Emblēmas')}>
                    <div className="flex flex-wrap gap-3 items-center">
                        <Badge variant="default">Default</Badge>
                        <Badge variant="secondary">Secondary</Badge>
                        <Badge variant="destructive">Destructive</Badge>
                        <Badge variant="outline">Outline</Badge>
                        {/* Custom project badges */}
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Bonus
                        </span>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary dark:bg-primary/40 dark:text-primary">
                            {l('Новинка', 'New', 'Jaunums')}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            {l('В наличии', 'In stock', 'Ir noliktavā')}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            {l('Нет в наличии', 'Out of stock', 'Nav noliktavā')}
                        </span>
                    </div>
                </Section>

                <Separator />

                {/* ── 6. Form Elements ──────────────────────────────────────── */}
                <Section title={l('6 · Элементы форм', '6 · Form elements', '6 · Formas elementi')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground font-medium">
                                {l('Состояния поля', 'Input states', 'Ievades lauka stāvokļi')}
                            </p>
                            <div className="space-y-2">
                                <Input
                                    placeholder={l(
                                        'Подсказка по умолчанию',
                                        'Default placeholder',
                                        'Noklusējuma vietturis'
                                    )}
                                />
                                <Input
                                    defaultValue={l(
                                        'Заполненное значение',
                                        'Filled value',
                                        'Aizpildīta vērtība'
                                    )}
                                />
                                <Input
                                    disabled
                                    placeholder={l('Отключено', 'Disabled', 'Atspējots')}
                                />
                                <Input
                                    className="border-destructive focus-visible:border-destructive"
                                    defaultValue={l(
                                        'Состояние ошибки',
                                        'Error state',
                                        'Kļūdas stāvoklis'
                                    )}
                                    aria-invalid
                                />
                                <p className="text-xs text-destructive">
                                    {l(
                                        'Поле обязательно для заполнения',
                                        'This field is required',
                                        'Šis lauks ir obligāts'
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground font-medium">Textarea</p>
                            <Textarea
                                placeholder={l(
                                    'Введите текст...',
                                    'Enter text...',
                                    'Ievadiet tekstu...'
                                )}
                                className="min-h-[120px]"
                            />
                            <Textarea
                                disabled
                                placeholder={l(
                                    'Отключённое текстовое поле',
                                    'Disabled textarea',
                                    'Atspējots teksta lauks'
                                )}
                            />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground mb-3 font-medium">
                            {l('Элементы управления', 'Controls', 'Vadīklas')}
                        </p>
                        <div className="flex flex-wrap gap-6 items-center">
                            <label
                                htmlFor="ds-check-1"
                                className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Checkbox id="ds-check-1" />
                                <span>
                                    {l(
                                        'Флажок не установлен',
                                        'Checkbox unchecked',
                                        'Izvēles rūtiņa nav atzīmēta'
                                    )}
                                </span>
                            </label>
                            <label
                                htmlFor="ds-check-2"
                                className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Checkbox id="ds-check-2" defaultChecked />
                                <span>
                                    {l(
                                        'Флажок установлен',
                                        'Checkbox checked',
                                        'Izvēles rūtiņa ir atzīmēta'
                                    )}
                                </span>
                            </label>
                            <label
                                htmlFor="ds-switch-1"
                                className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Switch id="ds-switch-1" />
                                <span>
                                    {l('Переключатель выключен', 'Switch off', 'Slēdzis izslēgts')}
                                </span>
                            </label>
                            <label
                                htmlFor="ds-switch-2"
                                className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Switch id="ds-switch-2" defaultChecked />
                                <span>
                                    {l('Переключатель включён', 'Switch on', 'Slēdzis ieslēgts')}
                                </span>
                            </label>
                        </div>
                    </div>
                </Section>

                <Separator />

                {/* ── 7. Cards ──────────────────────────────────────────────── */}
                <Section title={l('7 · Карточки', '7 · Cards', '7 · Kartītes')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {l('Базовая карточка', 'Base card', 'Pamata kartīte')}
                                </CardTitle>
                                <CardDescription>
                                    Shadcn Card · bg-card · border-border
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {l(
                                        'Контент карточки. Используется для группировки связанного контента.',
                                        'Card content. Used to group related content.',
                                        'Kartītes saturs. Izmanto saistīta satura grupēšanai.'
                                    )}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-md">
                            <CardHeader>
                                <CardTitle>
                                    {l('С тенью shadow-md', 'With shadow-md', 'Ar shadow-md ēnu')}
                                </CardTitle>
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
                                <CardTitle>
                                    {l('Акцентная карточка', 'Accent card', 'Akcenta kartīte')}
                                </CardTitle>
                                <CardDescription>border-primary · bg-primary/5</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button size="sm">{l('Действие', 'Action', 'Darbība')}</Button>
                            </CardContent>
                        </Card>

                        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                            <CardHeader>
                                <CardTitle>Amber · Bonus</CardTitle>
                                <CardDescription>
                                    {l(
                                        'Используется в BonusSection',
                                        'Used in BonusSection',
                                        'Izmanto BonusSection'
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <span className="text-2xl">⭐</span>
                            </CardContent>
                        </Card>

                        <Card className="border-destructive/30 bg-destructive/5">
                            <CardHeader>
                                <CardTitle>Destructive</CardTitle>
                                <CardDescription>
                                    {l(
                                        'Ошибки, предупреждения',
                                        'Errors and warnings',
                                        'Kļūdas un brīdinājumi'
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button variant="destructive" size="sm">
                                    {l('Удалить', 'Delete', 'Dzēst')}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                            <CardHeader>
                                <CardTitle>Success</CardTitle>
                                <CardDescription>
                                    {l(
                                        'Успешные действия',
                                        'Successful actions',
                                        'Veiksmīgas darbības'
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-green-700 dark:text-green-300">
                                    {l(
                                        'Операция выполнена успешно.',
                                        'The operation completed successfully.',
                                        'Darbība veiksmīgi pabeigta.'
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </Section>

                <Separator />

                {/* ── 8. Feedback States ────────────────────────────────────── */}
                <Section
                    title={l(
                        '8 · Обратная связь и уведомления',
                        '8 · Feedback & alerts',
                        '8 · Atgriezeniskā saite un paziņojumi'
                    )}
                >
                    <div className="space-y-2">
                        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                            ✓{' '}
                            {l(
                                'Успех — операция выполнена.',
                                'Success — the operation is complete.',
                                'Veiksmīgi — darbība ir pabeigta.'
                            )}
                        </div>
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
                            ⚠{' '}
                            {l(
                                'Предупреждение — обратите внимание.',
                                'Warning — attention required.',
                                'Brīdinājums — pievērsiet uzmanību.'
                            )}
                        </div>
                        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                            ✕{' '}
                            {l(
                                'Ошибка — что-то пошло не так.',
                                'Error — something went wrong.',
                                'Kļūda — kaut kas nogāja greizi.'
                            )}
                        </div>
                        <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
                            ℹ{' '}
                            {l(
                                'Информация — нейтральное сообщение.',
                                'Information — a neutral message.',
                                'Informācija — neitrāls ziņojums.'
                            )}
                        </div>
                        <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                            —{' '}
                            {l(
                                'Нейтральная подсказка без цветового акцента.',
                                'A neutral hint without a color accent.',
                                'Neitrāls padoms bez krāsas akcenta.'
                            )}
                        </div>
                    </div>
                </Section>

                <Separator />

                {/* ── 9. Skeleton / Loading ─────────────────────────────────── */}
                <Section
                    title={l(
                        '9 · Скелетон и загрузка',
                        '9 · Skeleton & loading',
                        '9 · Skelets un ielāde'
                    )}
                >
                    <div className="space-y-3 max-w-sm">
                        <div className="h-5 w-3/4 rounded-md bg-muted animate-pulse" />
                        <div className="h-4 w-full rounded-md bg-muted animate-pulse" />
                        <div className="h-4 w-5/6 rounded-md bg-muted animate-pulse" />
                        <div className="h-32 w-full rounded-lg bg-muted animate-pulse" />
                        <div className="flex gap-3">
                            <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
                            <div className="h-9 w-20 rounded-md bg-muted animate-pulse" />
                        </div>
                    </div>
                </Section>

                <Separator />

                {/* ── Footer ────────────────────────────────────────────────── */}
                <div className="text-xs text-muted-foreground pb-6">
                    HairShop-Pro · {l('Дизайн-система', 'Design system', 'Dizaina sistēma')} ·
                    Tailwind CSS + Shadcn/ui · Instrument Sans ·{' '}
                    {l(
                        'сформировано из рабочих компонентов',
                        'generated from live components',
                        'izveidots no reāliem komponentiem'
                    )}
                </div>
            </main>
        </AdminGate>
    );
}
