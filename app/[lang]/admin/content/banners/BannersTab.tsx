'use client';

import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
    BANNER_ZONES,
    BANNER_ZONE_LABELS,
    DEFAULT_GROUP_ID,
    type CtaStyle,
    type TextColor,
    type BannerZone,
    type BannerPlacement,
    type BannerScrollMode,
} from './banner-model';
import type { useBannerContentManager } from './useBannerContentManager';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { BANNER_MEDIA_ACCEPT, isVideoSource } from '@/lib/banner-media';

type BannerContentState = ReturnType<typeof useBannerContentManager>;

export default function BannersTab({ state }: { state: BannerContentState }): React.ReactElement {
    const { language, l } = useAdminLocale();
    const mediaInputRef = React.useRef<HTMLInputElement>(null);
    const {
            banners,
            groups,
            saving,
            savingGroups,
            bannerForm,
            setBannerForm,
            editingBannerId,
            showBannerForm,
            setShowBannerForm,
            uploadingBannerMedia,
            onBannerMediaUpload,
            onSaveBanner,
            onDeleteBanner,
            onToggleBanner,
            onMoveBanner,
            onEditBanner,
            resetBannerForm,
            onAddGroup,
            onUpdateGroup,
            onDeleteGroup,
            onMoveGroup,
          } = state;
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    return (
        <TabsContent value="banners" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
                {l("Сначала объедините баннеры в группы: у каждой группы своё место на главной и свой формат показа — список или карусель. Для карусели дополнительно выберите прокрутку — вручную (стрелками и точками) или автоматически. Затем в каждом баннере просто выберите группу. Статус «Да» публикует баннер, «Нет» сохраняет скрытым. В группе, размещённой в блоке акций, первый баннер типа «с текстом» всегда остаётся большой карточкой сверху.", "First combine banners into groups: each group has its own homepage location and its own display format — list or carousel. For a carousel, also pick the scroll mode — manual (arrows and dots) or automatic. Then just pick a group for each banner. Status Yes publishes the banner; No saves it hidden. In a group placed in the sale block, the first text-style banner always stays as the large card on top.", "Vispirms apvienojiet banerus grupās: katrai grupai ir sava vieta sākumlapā un savs attēlošanas formāts — saraksts vai karuselis. Karuselim papildus izvēlieties ritināšanu — manuālu (bultiņas un punkti) vai automātisku. Tad katram banerim vienkārši izvēlieties grupu. Jā publicē baneri; Nē saglabā paslēptu. Grupā, kas izvietota akciju blokā, pirmais teksta banera veids vienmēr paliek kā liela karte augšā.")}
            </p>

            {/* Group management */}
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">
                        {l('Группы баннеров', 'Banner groups', 'Baneru grupas')}
                    </h2>
                    <Button type="button" size="sm" variant="outline" disabled={savingGroups} onClick={() => void onAddGroup()}>
                        + {l('Добавить группу', 'Add group', 'Pievienot grupu')}
                    </Button>
                </div>
                <div className="space-y-2">
                    {sortedGroups.map((group, idx) => (
                        <div key={group.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                            <Input
                                defaultValue={group.name}
                                disabled={savingGroups}
                                className="w-40 flex-1 min-w-[10rem]"
                                onBlur={(e) => {
                                    const name = e.target.value.trim();
                                    if (name && name !== group.name) void onUpdateGroup(group.id, { name });
                                }}
                            />
                            <Select value={group.zone} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { zone: v as BannerZone })}>
                                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {BANNER_ZONES.map((zone) => (
                                        <SelectItem key={zone} value={zone}>{l(...BANNER_ZONE_LABELS[zone])}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={group.displayType} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { displayType: v as BannerPlacement })}>
                                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="list">{l('Список', 'List', 'Saraksts')}</SelectItem>
                                    <SelectItem value="carousel">{l('Карусель', 'Carousel', 'Karuselis')}</SelectItem>
                                </SelectContent>
                            </Select>
                            {group.displayType === 'carousel' && (
                                <Select value={group.scrollMode} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { scrollMode: v as BannerScrollMode })}>
                                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">{l('Прокрутка вручную', 'Manual scroll', 'Manuāla ritināšana')}</SelectItem>
                                        <SelectItem value="auto">{l('Автопрокрутка', 'Auto scroll', 'Automātiska ritināšana')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            <div className="flex items-center gap-1">
                                <Button type="button" variant="outline" size="sm" disabled={idx === 0 || savingGroups} onClick={() => void onMoveGroup(group.id, 'up')} aria-label={l('Переместить выше', 'Move up', 'Pārvietot augšup')}>▲</Button>
                                <Button type="button" variant="outline" size="sm" disabled={idx === sortedGroups.length - 1 || savingGroups} onClick={() => void onMoveGroup(group.id, 'down')} aria-label={l('Переместить ниже', 'Move down', 'Pārvietot lejup')}>▼</Button>
                                <Button type="button" variant="destructive" size="sm" disabled={savingGroups || group.id === DEFAULT_GROUP_ID} onClick={() => void onDeleteGroup(group.id)}>
                                    {l('Удалить', 'Delete', 'Dzēst')}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

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
                    id="banner-edit-form"
                    className={`scroll-mt-[var(--header-offset)] space-y-4 rounded-lg p-5 shadow-sm ${
                        editingBannerId
                            ? 'bg-rose-50/80 ring-1 ring-rose-200/70 dark:bg-rose-950/20 dark:ring-rose-800/50'
                            : 'border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                    }`}
                >
                    <h2 className="text-base font-semibold text-foreground">
                        {editingBannerId ? l('Редактировать баннер', 'Edit banner', 'Rediģēt baneri') : l('Новый баннер', 'New banner', 'Jauns baneris')}
                    </h2>

                    <div className="space-y-2">
                        <label htmlFor="admin-banner-format" className="text-sm font-medium">{l("Формат баннера", "Banner format", "Banera formāts")}</label>
                        <Select value={bannerForm.type} disabled={saving || uploadingBannerMedia} onValueChange={(type) => setBannerForm((f) => ({ ...f, type: type as 'sale' | 'image' | 'video', image: (type === 'video') !== (f.type === 'video') ? '' : f.image }))}>
                            <SelectTrigger id="admin-banner-format"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="image">{l("Готовое изображение — без текста поверх", "Ready-made image — no text overlay", "Gatavs attēls — bez teksta pārklājuma")}</SelectItem>
                                <SelectItem value="sale">{l("Баннер с текстом и кнопкой", "Banner with text and button", "Baneris ar tekstu un pogu")}</SelectItem>
                                <SelectItem value="video">{l('Видеобаннер', 'Video banner', 'Video baneris')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{l("Рекомендуемый размер готового баннера: 1440 × 480 px (3:1). Другие размеры допустимы: изображение показывается целиком без обрезки. JPG, PNG, WebP, GIF или AVIF, до 10 МБ. Загрузите файл, дождитесь предпросмотра и сохраните баннер. В режиме с текстом картинка служит фоном и может обрезаться.", "For ready-made banners we recommend 1440 × 480 px (3:1). Other sizes are accepted and shown in full without cropping. JPG, PNG, WebP, GIF or AVIF, up to 10 MB. Upload, wait for the preview and click Save. In text mode the image is a background and may be cropped.", "Ieteicamais izmērs: 1440 × 480 px (3:1). Citi izmēri ir atļauti, attēls tiek rādīts pilnībā. JPG, PNG, WebP, GIF vai AVIF, līdz 10 MB. Augšupielādējiet, sagaidiet priekšskatījumu un saglabājiet. Teksta režīmā fona attēls var tikt apgriezts.")}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{l('Видео: MP4 или WebM до 50 МБ, рекомендуем горизонтальное. Загруженное видео автоматически включает формат «Видеобаннер». На сайте видео показывается целиком с управлением воспроизведением; ссылка открывается отдельной кнопкой.', 'Video: MP4 or WebM up to 50 MB; landscape recommended. Uploading video automatically selects Video banner. The site shows the complete video with playback controls; the link uses a separate button.', 'Video: MP4 vai WebM līdz 50 MB; iesakām horizontālu. Video augšupielāde automātiski izvēlas video baneri. Vietnē video tiek rādīts pilnībā ar atskaņošanas vadību; saite ir atsevišķā pogā.')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {bannerForm.type === 'sale' && <>
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

                        </>}
                        {bannerForm.type !== 'sale' && <LocaleTextField
                            label={l('Описание фото или видео (необязательно, для доступности; на баннере не показывается)', 'Photo or video description (optional, for accessibility; not shown on the banner)', 'Foto vai video apraksts (nav obligāts, pieejamībai; uz banera netiek rādīts)')}
                            value={toLocaleForm(bannerForm.title)}
                            onChange={(next) => setBannerForm((f) => ({ ...f, title: encodeLocaleText(next) }))}
                        />}
                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-2"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Адрес фото или видео (заполняется после загрузки)', 'Photo or video address (filled after upload)', 'Foto vai video adrese (aizpildās pēc augšupielādes)')}
                            </label>
                            <Input
                                id="admin-banner-field-2"
                                value={bannerForm.image}
                                onChange={(e) =>
                                    setBannerForm((f) => ({ ...f, image: e.target.value, type: isVideoSource(e.target.value) ? 'video' : f.type }))
                                }
                                placeholder="/api/media/banner.jpg"
                            />
                        </div>

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-3"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Фото или видео с компьютера', 'Photo or video from your computer', 'Foto vai video no datora')}
                            </label>
                            <Input
                                id="admin-banner-field-3"
                                ref={mediaInputRef}
                                className="hidden"
                                type="file"
                                accept={BANNER_MEDIA_ACCEPT}
                                disabled={uploadingBannerMedia || saving}
                                onChange={onBannerMediaUpload}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" className="cursor-pointer" disabled={uploadingBannerMedia || saving}
                                    onClick={() => mediaInputRef.current?.click()}>
                                    {uploadingBannerMedia ? l('Загрузка…', 'Uploading…', 'Augšupielāde…') : l('Загрузить фото или видео с компьютера', 'Upload photo or video from computer', 'Augšupielādēt foto vai video no datora')}
                                </Button>
                                {bannerForm.image && <Button type="button" variant="outline" disabled={uploadingBannerMedia || saving}
                                    onClick={() => setBannerForm((f) => ({ ...f, image: '' }))}>
                                    {l('Убрать файл из баннера', 'Remove file from banner', 'Noņemt failu no banera')}
                                </Button>}
                            </div>
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

                        {bannerForm.type === 'video' && <LocaleTextField
                            label={l('Текст кнопки под видео (необязательно; кнопка появится, если указана ссылка)', 'Button text below video (optional; shown when a link is set)', 'Pogas teksts zem video (nav obligāts; tiek rādīts, ja ir saite)')}
                            value={toLocaleForm(bannerForm.ctaLabel)}
                            onChange={(next) => setBannerForm((f) => ({ ...f, ctaLabel: encodeLocaleText(next) }))}
                        />}
                        {bannerForm.type === 'sale' && <>
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

                        </>}
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

                        <div className="space-y-1">
                            <label
                                htmlFor="admin-banner-field-9"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Группа', 'Group', 'Grupa')}
                            </label>
                            <Select
                                value={bannerForm.groupId}
                                onValueChange={(v) =>
                                    setBannerForm((f) => ({ ...f, groupId: v }))
                                }
                            >
                                <SelectTrigger
                                    id="admin-banner-field-9"
                                    className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {sortedGroups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                            {group.name} — {l(...BANNER_ZONE_LABELS[group.zone])}, {group.displayType === 'carousel' ? l('карусель', 'carousel', 'karuselis') : l('список', 'list', 'saraksts')}
                                        </SelectItem>
                                    ))}
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
                        <div className={`${bannerForm.type === 'video' ? '' : 'pointer-events-none'} rounded-2xl border border-dashed border-border bg-muted/30 p-2 sm:p-3`}>
                            <SaleBanner
                                banner={{
                                    id: editingBannerId ?? 'banner-preview',
                                    type: bannerForm.type,
                                    title: bannerForm.title || (bannerForm.type === 'sale' ? l('Заголовок баннера', 'Banner title', 'Banera virsraksts') : ''),
                                    subtitle: bannerForm.subtitle,
                                    image: bannerForm.image,
                                    link: bannerForm.type === 'video' ? '' : bannerForm.link,
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
                        <Button onClick={onSaveBanner} disabled={saving || uploadingBannerMedia}>
                            {editingBannerId ? l('Сохранить изменения', 'Save changes', 'Saglabāt izmaiņas') : l('Создать баннер', 'Create banner', 'Izveidot baneri')}
                        </Button>
                        <Button variant="outline" onClick={resetBannerForm} disabled={saving || uploadingBannerMedia}>
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
                        const bannerGroup = groups.find((g) => g.id === banner.groupId);
                        return (
                            <div
                                key={banner.id}
                                className={`rounded-lg border bg-card p-4 flex gap-3 items-start transition-opacity ${
                                    banner.active ? 'border-border' : 'border-border opacity-50'
                                }`}
                            >
                                {/* Preview thumbnail */}
                                {banner.type === 'video' && banner.image ? (
                                    <video src={banner.image} muted playsInline preload="metadata" aria-label={previewTitle || undefined}
                                        className="h-16 w-24 rounded object-contain bg-black flex-shrink-0">
                                        <track kind="captions" />
                                    </video>
                                ) : banner.image ? (
                                    <Image
                                        src={banner.image}
                                        alt={previewTitle || l("Готовый баннер", "Ready-made banner", "Gatavs baneris")}
                                        width={96}
                                        height={64}
                                        unoptimized
                                        className="h-16 w-24 rounded object-contain bg-muted flex-shrink-0"
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
                                            {previewTitle || l("Готовый баннер", "Ready-made banner", "Gatavs baneris")}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {banner.type === 'video' ? l('Видеобаннер', 'Video banner', 'Video baneris') : banner.type === 'image' ? l('Готовое изображение', 'Ready-made image', 'Gatavs attēls') : l('Баннер с текстом', 'Text banner', 'Teksta baneris')}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {bannerGroup ? bannerGroup.name : l(...BANNER_ZONE_LABELS[banner.zone])}
                                        </span>
                                        {banner.placement === 'carousel' && (
                                            <span className="text-xs rounded-full px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                {l('Карусель', 'Carousel', 'Karuselis')}
                                            </span>
                                        )}
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
                                    <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className={`inline-flex ${idx === 0 || saving ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={idx === 0 || saving}
                                        className="cursor-pointer hover:border-primary hover:bg-primary/10 hover:text-primary"
                                        onClick={() => void onMoveBanner(banner.id, 'up')}
                                        aria-label={l('Переместить выше', 'Move up', 'Pārvietot augšup')}
                                    >
                                        ▲
                                    </Button>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{l('Переместить выше', 'Move up', 'Pārvietot augšup')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className={`inline-flex ${idx === banners.length - 1 || saving ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={idx === banners.length - 1 || saving}
                                        className="cursor-pointer hover:border-primary hover:bg-primary/10 hover:text-primary"
                                        onClick={() => void onMoveBanner(banner.id, 'down')}
                                        aria-label={l('Переместить ниже', 'Move down', 'Pārvietot lejup')}
                                    >
                                        ▼
                                    </Button>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{l('Переместить ниже', 'Move down', 'Pārvietot lejup')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="inline-flex">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={saving}
                                        onClick={() => void onToggleBanner(banner)}
                                    >
                                        {banner.active ? l('Скрыть', 'Hide', 'Paslēpt') : l('Показать', 'Show', 'Parādīt')}
                                    </Button>
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{banner.active ? l('Скрыть', 'Hide', 'Paslēpt') : l('Показать', 'Show', 'Parādīt')}</TooltipContent>
                                    </Tooltip>
                                    </TooltipProvider>
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
