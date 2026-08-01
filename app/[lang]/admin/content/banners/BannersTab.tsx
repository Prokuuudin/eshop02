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
import { LocaleTextField } from './LocaleTextField';
import {
    BANNER_TYPE_LABELS,
    CTA_STYLE_LABELS,
    toLocaleForm,
    type BannerType,
    type CtaStyle,
    type TextColor,
} from './banner-model';
import type { useBannerContentManager } from './useBannerContentManager';

type BannerContentState = ReturnType<typeof useBannerContentManager>;

export default function BannersTab({ state }: { state: BannerContentState }): React.ReactElement {
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
                    + Добавить баннер
                </Button>
            </div>

            {/* Banner form */}
            {showBannerForm && (
                <div className="rounded-lg border border-primary/30 dark:border-primary/50 bg-card p-5 space-y-4">
                    <h2 className="text-base font-semibold text-foreground">
                        {editingBannerId ? 'Редактировать баннер' : 'Новый баннер'}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-1"
                                className="text-xs text-muted-foreground"
                            >
                                Тип
                            </label>
                            <Select
                                value={bannerForm.type}
                                onValueChange={(v) =>
                                    setBannerForm((f) => ({ ...f, type: v as BannerType }))
                                }
                            >
                                <SelectTrigger
                                    id="admin-banner-field-1"
                                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(BANNER_TYPE_LABELS) as BannerType[]).map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {BANNER_TYPE_LABELS[t]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <LocaleTextField
                            label="Заголовок * (RU / EN / LV)"
                            value={toLocaleForm(bannerForm.title)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, title: encodeLocaleText(next) }))
                            }
                            placeholder="Заголовок баннера"
                        />

                        <LocaleTextField
                            label="Подзаголовок (RU / EN / LV)"
                            value={toLocaleForm(bannerForm.subtitle)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, subtitle: encodeLocaleText(next) }))
                            }
                            placeholder="Короткий текст под заголовком"
                        />

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-2"
                                className="text-xs text-muted-foreground"
                            >
                                Изображение (src)
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
                                Загрузить изображение
                            </label>
                            <Input
                                id="admin-banner-field-3"
                                type="file"
                                accept="image/*"
                                disabled={uploadingBannerImage || saving}
                                onChange={onBannerImageUpload}
                            />
                        </div>

                        {bannerForm.image && (
                            <div className="sm:col-span-2">
                                <Image
                                    src={bannerForm.image}
                                    alt="Превью баннера"
                                    width={800}
                                    height={128}
                                    unoptimized
                                    className="h-32 w-full rounded-md border border-border object-cover bg-muted"
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-4"
                                className="text-xs text-muted-foreground"
                            >
                                Ссылка (href)
                            </label>
                            <Input
                                id="admin-banner-field-4"
                                value={bannerForm.link}
                                onChange={(e) =>
                                    setBannerForm((f) => ({ ...f, link: e.target.value }))
                                }
                                placeholder="/catalog или https://..."
                            />
                        </div>

                        <LocaleTextField
                            label="Текст кнопки CTA (RU / EN / LV)"
                            value={toLocaleForm(bannerForm.ctaLabel)}
                            onChange={(next) =>
                                setBannerForm((f) => ({ ...f, ctaLabel: encodeLocaleText(next) }))
                            }
                            placeholder="Смотреть каталог"
                        />

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-5"
                                className="text-xs text-muted-foreground"
                            >
                                Стиль кнопки
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
                                    {(Object.keys(CTA_STYLE_LABELS) as CtaStyle[]).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {CTA_STYLE_LABELS[s]}
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
                                Цвет текста
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
                                    <SelectItem value="dark">Тёмный</SelectItem>
                                    <SelectItem value="light">Светлый</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-7"
                                className="text-xs text-muted-foreground"
                            >
                                Цвет фона
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
                                Активен
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
                                    <SelectItem value="yes">Да — отображается на сайте</SelectItem>
                                    <SelectItem value="no">Нет — скрыт</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <Button onClick={onSaveBanner} disabled={saving}>
                            {editingBannerId ? 'Сохранить изменения' : 'Создать баннер'}
                        </Button>
                        <Button variant="outline" onClick={resetBannerForm} disabled={saving}>
                            Отмена
                        </Button>
                    </div>
                </div>
            )}

            {/* Banner list */}
            {banners.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Баннеров пока нет. Нажмите «+ Добавить баннер», чтобы создать первый.
                </div>
            ) : (
                <div className="space-y-3">
                    {banners.map((banner, idx) => {
                        const previewTitle = resolveLocaleText(banner.title, 'ru');
                        const previewSubtitle = resolveLocaleText(banner.subtitle, 'ru');
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
                                        className="h-16 w-24 rounded flex-shrink-0 flex items-center justify-center text-xs text-gray-400"
                                        style={{ backgroundColor: banner.bgColor }}
                                    >
                                        Нет фото
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-foreground truncate">
                                            {previewTitle}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {BANNER_TYPE_LABELS[banner.type]}
                                        </span>
                                        <span
                                            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                                banner.active
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                    : 'bg-muted text-gray-500'
                                            }`}
                                        >
                                            {banner.active ? 'Активен' : 'Скрыт'}
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
                                        title="Выше"
                                    >
                                        ▲
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={idx === banners.length - 1 || saving}
                                        onClick={() => void onMoveBanner(banner.id, 'down')}
                                        title="Ниже"
                                    >
                                        ▼
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => void onToggleBanner(banner)}
                                        title={banner.active ? 'Скрыть' : 'Показать'}
                                    >
                                        {banner.active ? 'Скрыть' : 'Показать'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => onEditBanner(banner)}
                                    >
                                        Изменить
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => void onDeleteBanner(banner.id)}
                                    >
                                        Удалить
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
