'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import AdminGate from '@/components/admin/AdminGate';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { useAdminBrandsPage } from './useAdminBrandsPage';
import BrandLegalSection from './BrandLegalSection';
import NewBrandSection from './NewBrandSection';

export default function AdminBrandsPage(): React.ReactElement {
    const pageState = useAdminBrandsPage();
    const {
        tl,
        loading,
        saving,
        message,
        error,
        search,
        setSearch,
        filteredBrands,
        updateBrand,
        updateBrandDescription,
        handleSaveBrand,
        handleResetBrand,
        handleDeleteBrand,
    } = pageState;
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-4">
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                {tl(
                                    'admin.brands.title',
                                    'Бренды: управление',
                                    'Brands: management',
                                    'Zīmolu pārvaldība'
                                )}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {tl(
                                    'admin.brands.subtitle',
                                    'Создавайте новые бренды и редактируйте существующие карточки брендов.',
                                    'Create new brands and edit existing brand cards.',
                                    'Izveidojiet jaunus zīmolus un rediģējiet esošās zīmolu kartītes.'
                                )}
                            </p>
                        </div>
                        <Link href="/admin">
                            <Button variant="outline">
                                {tl(
                                    'admin.brands.backToAdmin',
                                    'Назад в админку',
                                    'Back to admin',
                                    'Atpakaļ uz administrēšanu'
                                )}
                            </Button>
                        </Link>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tl(
                                'admin.brands.searchPlaceholder',
                                'Поиск по названию или ID...',
                                'Search by name or ID...',
                                'Meklēt pēc nosaukuma vai ID...'
                            )}
                            className="h-9 flex-1"
                        />
                        <Search className="h-5 w-5 text-muted-foreground" />
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                            {tl('admin.brands.search', 'Поиск', 'Search', 'Meklēt')}
                        </span>
                    </div>
                </div>

                {message && (
                    <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
                        {message}
                    </p>
                )}
                {error && (
                    <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                        {error}
                    </p>
                )}

                <Accordion type="single" collapsible>
                <NewBrandSection state={pageState} />
                </Accordion>

                <section className="space-y-3">
                    <h2 className="text-lg font-semibold text-foreground">
                        {tl(
                            'admin.brands.existingBrands',
                            'Существующие бренды',
                            'Existing brands',
                            'Esošie zīmoli'
                        )}
                    </h2>

                    {loading ? (
                        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                            {tl(
                                'admin.brands.loading',
                                'Загрузка брендов...',
                                'Loading brands...',
                                'Notiek zīmolu ielāde...'
                            )}
                        </div>
                    ) : filteredBrands.length === 0 ? (
                        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                            {tl(
                                'admin.brands.noResults',
                                'Бренды не найдены',
                                'No brands found',
                                'Zīmoli nav atrasti'
                            )}
                        </div>
                    ) : (
                        filteredBrands.map((brand) => (
                            <article
                                key={brand.id}
                                className="rounded-xl bg-rose-50/80 p-4 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50"
                            >
                                <Accordion type="single" collapsible>
                                    <AccordionItem value={brand.id} className="border-0">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <AccordionTrigger className="flex-1 !justify-start gap-3 !border-0 !bg-transparent !p-0 text-left !no-underline focus:!no-underline [&>svg]:ml-3">
                                                <div>
                                                    <span className="block text-base font-semibold text-foreground">
                                                        {brand.name}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {brand.id}
                                                    </span>
                                                </div>
                                            </AccordionTrigger>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => void handleSaveBrand()}
                                                    disabled={saving}
                                                >
                                                    {saving
                                                        ? tl(
                                                              'admin.brands.saving',
                                                              'Сохранение...',
                                                              'Saving...',
                                                              'Saglabāšana...'
                                                          )
                                                        : tl(
                                                              'admin.brands.save',
                                                              'Сохранить',
                                                              'Save',
                                                              'Saglabāt'
                                                          )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleResetBrand(brand.id)}
                                                    disabled={saving}
                                                >
                                                    {tl(
                                                        'admin.brands.reset',
                                                        'Сбросить',
                                                        'Reset',
                                                        'Atiestatīt'
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => void handleDeleteBrand(brand.id)}
                                                    disabled={saving}
                                                >
                                                    {tl(
                                                        'admin.brands.delete',
                                                        'Удалить',
                                                        'Delete',
                                                        'Dzēst'
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <AccordionContent>
                                            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                                                <div className="grid gap-2 md:grid-cols-3">
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.name',
                                                                'Название',
                                                                'Name',
                                                                'Nosaukums'
                                                            )}
                                                        </span>
                                                        <Input
                                                            value={brand.name}
                                                            onChange={(event) =>
                                                                updateBrand(brand.id, {
                                                                    name: event.target.value,
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.isDistributor',
                                                                'Дистрибьютор',
                                                                'Distributor',
                                                                'Distributors'
                                                            )}
                                                        </span>
                                                        <Select
                                                            value={
                                                                brand.isDistributor ? 'yes' : 'no'
                                                            }
                                                            onValueChange={(v) =>
                                                                updateBrand(brand.id, {
                                                                    isDistributor: v === 'yes',
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="h-9 w-full rounded-md border border-border bg-card px-2 py-1 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="no">
                                                                    {tl(
                                                                        'admin.brands.option.no',
                                                                        'Нет',
                                                                        'No',
                                                                        'Ne'
                                                                    )}
                                                                </SelectItem>
                                                                <SelectItem value="yes">
                                                                    {tl(
                                                                        'admin.brands.option.yes',
                                                                        'Да',
                                                                        'Yes',
                                                                        'Ja'
                                                                    )}
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </label>
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.allowLogo',
                                                                'Разрешение на лого',
                                                                'Logo permission',
                                                                'Logo atlauja'
                                                            )}
                                                        </span>
                                                        <Select
                                                            value={brand.allowLogo ? 'yes' : 'no'}
                                                            onValueChange={(v) =>
                                                                updateBrand(brand.id, {
                                                                    allowLogo: v === 'yes',
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="h-9 w-full rounded-md border border-border bg-card px-2 py-1 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="no">
                                                                    {tl(
                                                                        'admin.brands.option.no',
                                                                        'Нет',
                                                                        'No',
                                                                        'Ne'
                                                                    )}
                                                                </SelectItem>
                                                                <SelectItem value="yes">
                                                                    {tl(
                                                                        'admin.brands.option.yes',
                                                                        'Да',
                                                                        'Yes',
                                                                        'Ja'
                                                                    )}
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </label>
                                                    <label className="text-xs md:col-span-3">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.logoPath',
                                                                'Путь к логотипу',
                                                                'Logo path',
                                                                'Logo cels'
                                                            )}
                                                        </span>
                                                        <Input
                                                            value={brand.logo}
                                                            onChange={(event) =>
                                                                updateBrand(brand.id, {
                                                                    logo: event.target.value,
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.descriptionRu',
                                                                'Описание RU',
                                                                'Description RU',
                                                                'Apraksts RU'
                                                            )}
                                                        </span>
                                                        <Input
                                                            value={brand.description.ru}
                                                            onChange={(event) =>
                                                                updateBrandDescription(brand.id, {
                                                                    ru: event.target.value,
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.descriptionEn',
                                                                'Описание EN',
                                                                'Description EN',
                                                                'Apraksts EN'
                                                            )}
                                                        </span>
                                                        <Input
                                                            value={brand.description.en}
                                                            onChange={(event) =>
                                                                updateBrandDescription(brand.id, {
                                                                    en: event.target.value,
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                    <label className="text-xs">
                                                        <span className="mb-1 block text-muted-foreground">
                                                            {tl(
                                                                'admin.brands.field.descriptionLv',
                                                                'Описание LV',
                                                                'Description LV',
                                                                'Apraksts LV'
                                                            )}
                                                        </span>
                                                        <Input
                                                            value={brand.description.lv}
                                                            onChange={(event) =>
                                                                updateBrandDescription(brand.id, {
                                                                    lv: event.target.value,
                                                                })
                                                            }
                                                        />
                                                    </label>
                                                </div>

                                                <div className="rounded-lg border border-border bg-muted p-2 dark:bg-gray-800/40">
                                                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                                        {tl(
                                                            'admin.brands.cardPreview',
                                                            'Превью карточки',
                                                            'Card preview',
                                                            'Kartites priekskats'
                                                        )}
                                                    </p>
                                                    <div className="rounded border border-border bg-white p-3 dark:bg-gray-900">
                                                        <div className="relative mx-auto h-12 w-24">
                                                            <Image
                                                                unoptimized
                                                                src={
                                                                    brand.logo.trim() ||
                                                                    '/brands/new-brand.svg'
                                                                }
                                                                alt={brand.name}
                                                                width={96}
                                                                height={48}
                                                                className="h-full w-full object-contain"
                                                                onError={(event) => {
                                                                    event.currentTarget.onerror =
                                                                        null;
                                                                    event.currentTarget.src =
                                                                        '/brands/new-brand.svg';
                                                                }}
                                                            />
                                                        </div>
                                                        <p className="mt-2 text-center text-sm font-medium text-foreground">
                                                            {brand.name}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <BrandLegalSection brand={brand} state={pageState} />
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </article>
                        ))
                    )}
                </section>
            </main>
        </AdminGate>
    );
}
