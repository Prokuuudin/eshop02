'use client';

import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { encodeLocaleText, resolveLocaleText } from '@/lib/locale-text';
import SaleBanner from '@/components/SaleBanner';
import { LocaleTextField } from './LocaleTextField';
import {
    toLocaleForm,
    type CtaStyle,
    type TextColor,
} from './banner-model';
import type { useBannerContentManager } from './useBannerContentManager';
import { useAdminLocale } from '@/lib/use-admin-locale';

type BannerContentState = ReturnType<typeof useBannerContentManager>;

export default function BannersTab({ state }: { state: BannerContentState }): React.ReactElement {
    const { language, l } = useAdminLocale();
    const {
            banners,
            saving,
            bannerForm,
            setBannerForm,
            editingBannerId,
            showBannerForm,
            setShowBannerForm,
            uploadingBannerImage,
            onBannerImageUpload,
            onSaveBanner,
            onDeleteBanner,
            onToggleBanner,
            onMoveBanner,
            onEditBanner,
            resetBannerForm,
          } = state;
    return (
        <TabsContent value="banners" className="space-y-4 mt-4">
            <div className="flex justify-end">
                <Button
                    onClick={() => {
                        resetBannerForm();
                        setShowBannerForm(true);
                    }}
                    disabled={saving}
                >
                    + {l('Добавить баннер', 'Add banner', 'Pievienot baneri')}
                </Button>
            </div>

            {/* Banner form */}
            {showBannerForm && (
                <div
                    className={`space-y-4 rounded-lg p-5 shadow-sm ${
                        editingBannerId
                            ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
                            : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                    }`}
                >
                    <h2 className="text-base font-semibold text-foreground">
                        {editingBannerId ? l('Редактировать баннер', 'Edit banner', 'Rediģēt baneri') : l('Новый баннер', 'New banner', 'Jauns baneris')}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <LocaleTextField
                            label={l('Заголовок * (RU / EN / LV)', 'Title * (RU / EN / LV)', 'Virsraksts * (RU / EN / LV)')}
                            value={toLocaleForm(bannerForm.title)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, title: encodeLocaleText(next) }))
                            }
                            placeholder={l('Заголовок баннера', 'Banner title', 'Banera virsraksts')}
                        />

                        <LocaleTextField
                            label={l('Подзаголовок (RU / EN / LV)', 'Subtitle (RU / EN / LV)', 'Apakšvirsraksts (RU / EN / LV)')}
                            value={toLocaleForm(bannerForm.subtitle)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, subtitle: encodeLocaleText(next) }))
                            }
                            placeholder={l('Короткий текст под заголовком', 'Short text below the title', 'Īss teksts zem virsraksta')}
                        />

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-2"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Изображение (src)', 'Image (src)', 'Attēls (src)')}
                            </label>
                            <Input
                                id="admin-banner-field-2"
                                value={bannerForm.image}
                                onChange={(e) =>
                                    setBannerForm((f) => ({ ...f, image: e.target.value }))
                                }
                                placeholder="/api/media/banner.jpg"
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-3"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Загрузить изображение', 'Upload image', 'Augšupielādēt attēlu')}
                            </label>
                            <Input
                                id="admin-banner-field-3"
                                type="file"
                                accept="image/*"
                                disabled={uploadingBannerImage || saving}
                                onChange={onBannerImageUpload}
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-4"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Ссылка (href)', 'Link (href)', 'Saite (href)')}
                            </label>
                            <Input
                                id="admin-banner-field-4"
                                value={bannerForm.link}
                                onChange={(e) =>
                                    setBannerForm((f) => ({ ...f, link: e.target.value }))
                                }
                                placeholder={l('/catalog или https://...', '/catalog or https://...', '/catalog vai https://...')}
                            />
                        </div>

                        <LocaleTextField
                            label={l('Текст кнопки CTA (RU / EN / LV)', 'CTA button text (RU / EN / LV)', 'CTA pogas teksts (RU / EN / LV)')}
                            value={toLocaleForm(bannerForm.ctaLabel)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, ctaLabel: encodeLocaleText(next) }))
                            }
                            placeholder={l('Смотреть каталог', 'View catalog', 'Skatīt katalogu')}
                        />

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-5"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Стиль кнопки', 'Button style', 'Pogas stils')}
                            </label>
                            <Select
                                value={bannerForm.ctaStyle}
                                onValueChange={(v) =>
                                    setBannerForm((f) => ({ ...f, ctaStyle: v as CtaStyle }))
                                }
                            >
                                <SelectTrigger
                                    id="admin-banner-field-5"
                                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['primary', 'secondary', 'outline'] as CtaStyle[]).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {s === 'primary' ? l('Основная', 'Primary', 'Primārā') : s === 'secondary' ? l('Вторичная', 'Secondary', 'Sekundārā') : l('Контурная', 'Outline', 'Kontūra')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-6"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Цвет текста', 'Text color', 'Teksta krāsa')}
                            </label>
                            <Select
                                value={bannerForm.textColor}
                                onValueChange={(v) =>
                                    setBannerForm((f) => ({ ...f, textColor: v as TextColor }))
                                }
                            >
                                <SelectTrigger
                                    id="admin-banner-field-6"
                                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dark">{l('Тёмный', 'Dark', 'Tumšs')}</SelectItem>
                                    <SelectItem value="light">{l('Светлый', 'Light', 'Gaišs')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-7"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Цвет фона', 'Background color', 'Fona krāsa')}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id="admin-banner-field-7"
                                    type="color"
                                    value={bannerForm.bgColor}
                                    onChange={(e) =>
                                        setBannerForm((f) => ({ ...f, bgColor: e.target.value }))
                                    }
                                    className="h-9 w-14 rounded border border-border cursor-pointer"
                                />
                                <Input
                                    value={bannerForm.bgColor}
                                    onChange={(e) =>
                                        setBannerForm((f) => ({ ...f, bgColor: e.target.value }))
                                    }
                                    placeholder="#ffffff"
                                    className="flex-1"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-8"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Активен', 'Active', 'Aktīvs')}
                            </label>
                            <Select
                                value={bannerForm.active ? 'yes' : 'no'}
                                onValueChange={(v) =>
                                    setBannerForm((f) => ({ ...f, active: v === 'yes' }))
                                }
                            >
                                <SelectTrigger
                                    id="admin-banner-field-8"
                                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="yes">{l('Да — отображается на сайте', 'Yes — shown on the site', 'Jā — tiek rādīts vietnē')}</SelectItem>
                                    <SelectItem value="no">{l('Нет — скрыт', 'No — hidden', 'Nē — paslēpts')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <section className="space-y-2" aria-labelledby="admin-banner-preview-title">
                        <div className="flex items-center justify-between gap-3">
                            <h3
                                id="admin-banner-preview-title"
                                className="text-sm font-semibold text-foreground"
                            >
                                {l('Предпросмотр на витрине', 'Storefront preview', 'Veikala priekšskatījums')}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {l('Обновляется автоматически', 'Updates automatically', 'Atjaunojas automātiski')}
                            </span>
                        </div>
                        <div className="pointer-events-none rounded-2xl border border-dashed border-border bg-muted/30 p-2 sm:p-3">
                            <SaleBanner
                                banner={{
                                    id: editingBannerId ?? 'banner-preview',
                                    title: bannerForm.title || l('Заголовок баннера', 'Banner title', 'Banera virsraksts'),
                                    subtitle: bannerForm.subtitle,
                                    image: bannerForm.image,
                                    link: bannerForm.link,
                                    ctaLabel: bannerForm.ctaLabel,
                                    ctaStyle: bannerForm.ctaStyle,
                                    bgColor: bannerForm.bgColor || '#ffffff',
                                    textColor: bannerForm.textColor,
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {l('Текст отображается на языке текущей версии админки. Ссылки в предпросмотре отключены.', 'Text is shown in the current admin language. Preview links are disabled.', 'Teksts tiek rādīts pašreizējā administrācijas valodā. Priekšskatījuma saites ir atspējotas.')}
                        </p>
                    </section>

                    <div className="flex items-center gap-2 pt-1">
                        <Button onClick={onSaveBanner} disabled={saving}>
                            {editingBannerId ? l('Сохранить изменения', 'Save changes', 'Saglabāt izmaiņas') : l('Создать баннер', 'Create banner', 'Izveidot baneri')}
                        </Button>
                        <Button variant="outline" onClick={resetBannerForm} disabled={saving}>
                            {l('Отмена', 'Cancel', 'Atcelt')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Banner list */}
            {banners.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {l('Баннеров пока нет. Нажмите «+ Добавить баннер», чтобы создать первый.', 'There are no banners yet. Click “+ Add banner” to create the first one.', 'Baneru vēl nav. Noklikšķiniet “+ Pievienot baneri”, lai izveidotu pirmo.')}
                </div>
            ) : (
                <div className="space-y-3">
                    {banners.map((banner, idx) => {
                        const previewTitle = resolveLocaleText(banner.title, language);
                        const previewSubtitle = resolveLocaleText(banner.subtitle, language);
                        return (
                            <div
                                key={banner.id}
                                className={`rounded-lg border bg-card p-4 flex gap-3 items-start transition-opacity ${
                                    banner.active ? 'border-border' : 'border-border opacity-50'
                                }`}
                            >
                                {/* Preview thumbnail */}
                                {banner.image ? (
                                    <Image
                                        src={banner.image}
                                        alt={previewTitle}
                                        width={96}
                                        height={64}
                                        unoptimized
                                        className="h-16 w-24 rounded object-cover bg-muted flex-shrink-0"
                                    />
                                ) : (
                                    <div
                                        className="h-16 w-24 rounded flex-shrink-0 flex items-center justify-center text-xs text-muted-foreground"
                                        style={{ backgroundColor: banner.bgColor }}
                                    >
                                        {l('Нет фото', 'No image', 'Nav attēla')}
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-foreground truncate">
                                            {previewTitle}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {l('Скидка/Акция', 'Discount/Promotion', 'Atlaide/Akcija')}
                                        </span>
                                        <span
                                            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                                banner.active
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                    : 'bg-muted text-gray-500'
                                            }`}
                                        >
                                            {banner.active ? l('Активен', 'Active', 'Aktīvs') : l('Скрыт', 'Hidden', 'Paslēpts')}
                                        </span>
                                    </div>
                                    {previewSubtitle && (
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                            {previewSubtitle}
                                        </p>
                                    )}
                                    {banner.link && (
                                        <p className="text-xs text-primary mt-0.5 truncate">
                                            {banner.link}
                                        </p>
                                    )}
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={idx === 0 || saving}
                                        onClick={() => void onMoveBanner(banner.id, 'up')}
                                        title={l('Выше', 'Move up', 'Pārvietot augšup')}
                                    >
                                        ▲
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={idx === banners.length - 1 || saving}
                                        onClick={() => void onMoveBanner(banner.id, 'down')}
                                        title={l('Ниже', 'Move down', 'Pārvietot lejup')}
                                    >
                                        ▼
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => void onToggleBanner(banner)}
                                        title={banner.active ? l('Скрыть', 'Hide', 'Paslēpt') : l('Показать', 'Show', 'Parādīt')}
                                    >
                                        {banner.active ? l('Скрыть', 'Hide', 'Paslēpt') : l('Показать', 'Show', 'Parādīt')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => onEditBanner(banner)}
                                    >
                                        {l('Изменить', 'Edit', 'Rediģēt')}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => void onDeleteBanner(banner.id)}
                                    >
                                        {l('Удалить', 'Delete', 'Dzēst')}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </TabsContent>
    );
}
