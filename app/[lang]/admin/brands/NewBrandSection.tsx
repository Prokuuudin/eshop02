'use client';

import Image from 'next/image';
import { ChevronDown, Plus } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { useAdminBrandsPage } from './useAdminBrandsPage';

type State = ReturnType<typeof useAdminBrandsPage>;

export default function NewBrandSection({ state }: { state: State }): React.ReactElement {
    const { tl, saving, newBrand, setNewBrand, handleCreateBrand, newBrandTitle } = state;

    return (
            <AccordionItem
                value="new-brand"
                className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/20"
            >
                <AccordionTrigger className="group !border-0 !bg-transparent !p-0 !no-underline focus:!no-underline">
                    <div className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-4 py-3.5 transition-colors hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            <Plus className="h-6 w-6" />
                        </span>
                        <span className="text-base font-semibold">
                            {tl(
                                'admin.brands.addBrand',
                                'Добавить бренд',
                                'Add brand',
                                'Pievienot zīmolu'
                            )}
                        </span>
                        <ChevronDown className="ml-auto h-5 w-5 text-emerald-700 transition-transform duration-200 group-data-[state=open]:rotate-180 dark:text-emerald-400" />
                    </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-emerald-200 px-4 pb-4 dark:border-emerald-800">
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                        <div className="grid gap-2 md:grid-cols-3">
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">
                                    {tl(
                                        'admin.brands.field.idSlug',
                                        'ID (slug)',
                                        'ID (slug)',
                                        'ID (slug)'
                                    )}
                                </span>
                                <Input
                                    value={newBrand.id}
                                    placeholder={tl(
                                        'admin.brands.placeholder.id',
                                        'Например: matrix',
                                        'Example: matrix',
                                        'Piemers: matrix'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            id: event.target.value,
                                        }))
                                    }
                                />
                            </label>
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
                                    value={newBrand.name}
                                    placeholder={tl(
                                        'admin.brands.placeholder.name',
                                        'Например: Matrix',
                                        'Example: Matrix',
                                        'Piemers: Matrix'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            name: event.target.value,
                                        }))
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
                                    value={newBrand.isDistributor ? 'yes' : 'no'}
                                    onValueChange={(v) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            isDistributor: v === 'yes',
                                        }))
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
                                    value={newBrand.allowLogo ? 'yes' : 'no'}
                                    onValueChange={(v) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            allowLogo: v === 'yes',
                                        }))
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
                                    value={newBrand.logo}
                                    placeholder={tl(
                                        'admin.brands.placeholder.logoPath',
                                        '/brands/matrix.svg',
                                        '/brands/matrix.svg',
                                        '/brands/matrix.svg'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            logo: event.target.value,
                                        }))
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
                                    value={newBrand.descriptionRu}
                                    placeholder={tl(
                                        'admin.brands.placeholder.descriptionRu',
                                        'Краткое описание бренда на русском',
                                        'Short brand description in Russian',
                                        'Īss zīmola apraksts krievu valodā'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            descriptionRu: event.target.value,
                                        }))
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
                                    value={newBrand.descriptionEn}
                                    placeholder={tl(
                                        'admin.brands.placeholder.descriptionEn',
                                        'Краткое описание бренда на английском',
                                        'Short brand description in English',
                                        'Īss zīmola apraksts angļu valodā'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            descriptionEn: event.target.value,
                                        }))
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
                                    value={newBrand.descriptionLv}
                                    placeholder={tl(
                                        'admin.brands.placeholder.descriptionLv',
                                        'Краткое описание бренда на латышском',
                                        'Short brand description in Latvian',
                                        'Īss zīmola apraksts latviešu valodā'
                                    )}
                                    onChange={(event) =>
                                        setNewBrand((prev) => ({
                                            ...prev,
                                            descriptionLv: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                        </div>
        
                        <div className="rounded-lg border border-border bg-card p-2">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {tl(
                                    'admin.brands.cardPreview',
                                    'Превью карточки',
                                    'Card preview',
                                    'Kartites priekskats'
                                )}
                            </p>
                            <div className="rounded border border-border p-3">
                                <div className="relative mx-auto h-12 w-24">
                                    <Image
                                        unoptimized
                                        src={
                                            newBrand.logo.trim() || '/brands/new-brand.svg'
                                        }
                                        alt={newBrandTitle}
                                        width={96}
                                        height={48}
                                        className="h-full w-full object-contain"
                                        onError={(event) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src =
                                                '/brands/new-brand.svg';
                                        }}
                                    />
                                </div>
                                <p className="mt-2 text-center text-sm font-medium text-foreground">
                                    {newBrandTitle}
                                </p>
                            </div>
                        </div>
                    </div>
        
                    <div className="mt-3 flex justify-end">
                        <Button onClick={() => void handleCreateBrand()} disabled={saving}>
                            {saving
                                ? tl(
                                      'admin.brands.saving',
                                      'Сохранение...',
                                      'Saving...',
                                      'Saglabāšana...'
                                  )
                                : tl(
                                      'admin.brands.addBrand',
                                      'Добавить бренд',
                                      'Add brand',
                                      'Pievienot zīmolu'
                                  )}
                        </Button>
                    </div>
                </AccordionContent>
            </AccordionItem>
    );
}

