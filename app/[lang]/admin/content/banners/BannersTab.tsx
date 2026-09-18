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
import { ChevronDown, Info } from 'lucide-react';
import { encodeLocaleText, resolveLocaleText } from '@/lib/locale-text';
import SaleBanner from '@/components/SaleBanner';
import { LocaleTextField } from './LocaleTextField';
import { LinkPicker } from './LinkPicker';
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
            onDiscardBannerChanges,
            onAddGroup,
            onUpdateGroup,
            onDeleteGroup,
            onMoveGroup,
          } = state;
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    return (
        <TabsContent value="banners" className="space-y-4 mt-4">
            <aside className="rounded-lg border border-blue-200 bg-blue-50/70 p-5 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <Info aria-hidden="true" className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                    <h2 className="text-base font-semibold leading-6">
                        {l('Как устроена эта страница', 'How this page works', 'Kā darbojas šī lapa')}
                    </h2>
                    <span className="relative top-px shrink-0 text-xs font-medium leading-6 text-blue-700 group-open:hidden dark:text-blue-300">
                        {l('Развернуть', 'Expand', 'Izvērst')}
                    </span>
                    <span className="relative top-px hidden shrink-0 text-xs font-medium leading-6 text-blue-700 group-open:inline dark:text-blue-300">
                        {l('Свернуть', 'Collapse', 'Sakļaut')}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-blue-700 transition-transform duration-200 group-open:rotate-180 dark:text-blue-300" />
                </summary>
                <div className="mt-3 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold">{l('Группы и размещение', 'Groups and placement', 'Grupas un izvietojums')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l("Любые баннеры должны быть объединены в группы со своим местом на главной странице и форматом показа — список или карусель. Сначала создайте группу, затем в каждом нужном баннере выберите её. В группе, размещённой в «Блок акций», первый баннер формата «с текстом» всегда остаётся большой карточкой сверху.", 'Every banner must belong to a group with its own homepage location and display format — list or carousel. First create a group, then pick it for each banner that needs it. In a group placed in the "Sale block", the first text-format banner always stays as the large card on top.', 'Katram banerim jāpieder grupai ar savu vietu sākumlapā un attēlošanas formātu — sarakstu vai karuseli. Vispirms izveidojiet grupu, tad izvēlieties to katram vajadzīgajam banerim. Grupā, kas izvietota sadaļā "Akciju bloks", pirmais teksta formāta baneris vienmēr paliek kā liela karte augšā.')}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">{l('Прокрутка карусели', 'Carousel scroll', 'Karuseļa ritināšana')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l('Для групп с показом «Карусель» выберите прокрутку: вручную (стрелками и точками) или автоматически (сама листает баннеры).', 'For groups with Carousel display, pick the scroll mode: manual (arrows and dots) or automatic (it flips banners on its own).', 'Grupām ar attēlošanu "Karuselis" izvēlieties ritināšanu: manuāli (ar bultiņām un punktiem) vai automātiski (pati pārslēdz banerus).')}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">{l('Формат баннера', 'Banner format', 'Banera formāts')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l("Рекомендуемый размер готового баннера: 1440 × 480 px (3:1). Другие размеры допустимы: изображение показывается целиком без обрезки. JPG, PNG, WebP, GIF или AVIF, до 10 МБ. Загрузите файл, дождитесь предпросмотра и сохраните баннер. В режиме с текстом картинка служит фоном и может обрезаться.", "For ready-made banners we recommend 1440 × 480 px (3:1). Other sizes are accepted and shown in full without cropping. JPG, PNG, WebP, GIF or AVIF, up to 10 MB. Upload, wait for the preview and click Save. In text mode the image is a background and may be cropped.", "Ieteicamais izmērs: 1440 × 480 px (3:1). Citi izmēri ir atļauti, attēls tiek rādīts pilnībā. JPG, PNG, WebP, GIF vai AVIF, līdz 10 MB. Augšupielādējiet, sagaidiet priekšskatījumu un saglabājiet. Teksta režīmā fona attēls var tikt apgriezts.")}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">{l('Видео', 'Video', 'Video')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l('MP4 или WebM до 50 МБ, рекомендуем горизонтальное. Загруженное видео автоматически включает формат «Видеобаннер». На сайте видео показывается целиком с управлением воспроизведением; ссылка открывается отдельной кнопкой.', 'MP4 or WebM up to 50 MB; landscape recommended. Uploading video automatically selects Video banner. The site shows the complete video with playback controls; the link uses a separate button.', 'MP4 vai WebM līdz 50 MB; iesakām horizontālu. Video augšupielāde automātiski izvēlas video baneri. Vietnē video tiek rādīts pilnībā ar atskaņošanas vadību; saite ir atsevišķā pogā.')}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">{l('Ссылка баннера', 'Banner link', 'Banera saite')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l('Кнопка «Выбрать страницу» открывает поиск по товарам, список категорий и подкатегорий, а также конструктор ссылки на каталог с фильтрами (по нескольким подкатегориям и брендам сразу). Ссылку также можно ввести вручную: внутренний путь через «/» или полный адрес другого сайта через http(s)://.', 'The "Choose a page" button opens product search, the category/subcategory list, and a catalog-with-filters link builder (several subcategories and brands at once). You can also type the link by hand: an internal path starting with "/" or a full external address starting with http(s)://.', '"Izvēlēties lapu" atver preču meklēšanu, kategoriju/apakškategoriju sarakstu un kataloga ar filtriem saites veidotāju (vairākas apakškategorijas un zīmoli reizē). Saiti var arī ierakstīt pašrocīgi: iekšēju ceļu, kas sākas ar "/", vai pilnu ārējas vietnes adresi, kas sākas ar http(s)://.')}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold">{l('Статус', 'Status', 'Statuss')}</h3>
                        <p className="mt-1 text-blue-900/80 dark:text-blue-100/80">
                            {l('«Активен: Да» публикует баннер на сайте, «Нет» сохраняет его скрытым — можно готовить баннеры заранее и включать их позже.', 'Active "Yes" publishes the banner on the site; "No" keeps it saved but hidden — useful for preparing banners ahead of time.', 'Aktīvs "Jā" publicē baneri vietnē; "Nē" saglabā to paslēptu — noderīgi, lai gatavotu banerus iepriekš.')}
                        </p>
                    </div>
                </div>
                </details>
            </aside>

            {/* Group management */}
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">
                        {l('Группы баннеров', 'Banner groups', 'Baneru grupas')}
                    </h2>
                    <Button type="button" disabled={savingGroups} onClick={() => void onAddGroup()}>
                        + {l('Добавить группу', 'Add group', 'Pievienot grupu')}
                    </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full text-sm">
                        <thead className="border-b border-border bg-muted">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{l('Название', 'Name', 'Nosaukums')}</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{l('Место на главной', 'Homepage location', 'Vieta sākumlapā')}</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{l('Показ', 'Display', 'Rādīšana')}</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{l('Прокрутка', 'Scroll', 'Ritināšana')}</th>
                                <th className="px-3 py-2 text-right font-medium text-muted-foreground">{l('Действия', 'Actions', 'Darbības')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedGroups.map((group, idx) => (
                                <tr key={group.id}>
                                    <td className="px-3 py-2">
                                        <Input
                                            defaultValue={group.name}
                                            disabled={savingGroups}
                                            className="min-w-[10rem]"
                                            onBlur={(e) => {
                                                const name = e.target.value.trim();
                                                if (name && name !== group.name) void onUpdateGroup(group.id, { name });
                                            }}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <Select value={group.zone} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { zone: v as BannerZone })}>
                                            <SelectTrigger className="min-w-[13rem]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {BANNER_ZONES.map((zone) => (
                                                    <SelectItem key={zone} value={zone}>{l(...BANNER_ZONE_LABELS[zone])}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Select value={group.displayType} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { displayType: v as BannerPlacement })}>
                                            <SelectTrigger className="min-w-[9rem]"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="list">{l('Список', 'List', 'Saraksts')}</SelectItem>
                                                <SelectItem value="carousel">{l('Карусель', 'Carousel', 'Karuselis')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-3 py-2">
                                        {group.displayType === 'carousel' ? (
                                            <Select value={group.scrollMode} disabled={savingGroups} onValueChange={(v) => void onUpdateGroup(group.id, { scrollMode: v as BannerScrollMode })}>
                                                <SelectTrigger className="min-w-[11rem]"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="manual">{l('Вручную', 'Manual', 'Manuāli')}</SelectItem>
                                                    <SelectItem value="auto">{l('Автоматически', 'Automatic', 'Automātiski')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button type="button" variant="outline" size="sm" disabled={idx === 0 || savingGroups} onClick={() => void onMoveGroup(group.id, 'up')} aria-label={l('Переместить выше', 'Move up', 'Pārvietot augšup')}>▲</Button>
                                            <Button type="button" variant="outline" size="sm" disabled={idx === sortedGroups.length - 1 || savingGroups} onClick={() => void onMoveGroup(group.id, 'down')} aria-label={l('Переместить ниже', 'Move down', 'Pārvietot lejup')}>▼</Button>
                                            <Button type="button" variant="destructive" size="sm" disabled={savingGroups || group.id === DEFAULT_GROUP_ID} onClick={() => void onDeleteGroup(group.id)}>
                                                {l('Удалить', 'Delete', 'Dzēst')}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
                    className={`scroll-mt-[var(--header-offset)] space-y-3 rounded-lg p-4 shadow-sm ${
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
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                                className="max-w-md"
                                value={bannerForm.image}
                                onChange={(e) =>
                                    setBannerForm((f) => ({ ...f, image: e.target.value, type: isVideoSource(e.target.value) ? 'video' : f.type }))
                                }
                                placeholder="/api/media/banner.jpg"
                            />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
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

                        <div className="space-y-1 sm:col-span-2">
                            <label
                                htmlFor="admin-banner-field-4"
                                className="text-xs text-muted-foreground"
                            >
                                {l('Куда ведёт баннер при клике (ссылка)', 'Where the banner links to when clicked', 'Kurp baneris ved, ja uzklikšķina')}
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    id="admin-banner-field-4"
                                    className="max-w-md"
                                    value={bannerForm.link}
                                    onChange={(e) =>
                                        setBannerForm((f) => ({ ...f, link: e.target.value }))
                                    }
                                    placeholder={l('/catalog или https://...', '/catalog or https://...', '/catalog vai https://...')}
                                />
                                <LinkPicker value={bannerForm.link} onChange={(link) => setBannerForm((f) => ({ ...f, link }))} />
                            </div>
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
                                    className="w-full max-w-xs rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
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
                                    className="w-full max-w-xs rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
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
                            <div className="flex max-w-xs items-center gap-2">
                                <input
                                    id="admin-banner-field-7"
                                    type="color"
                                    value={bannerForm.bgColor}
                                    onChange={(e) =>
                                        setBannerForm((f) => ({ ...f, bgColor: e.target.value }))
                                    }
                                    className="h-9 w-14 shrink-0 rounded border border-border cursor-pointer"
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
                                    className="w-full max-w-xs rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="yes">{l('Да — отображается на сайте', 'Yes — shown on the site', 'Jā — tiek rādīts vietnē')}</SelectItem>
                                    <SelectItem value="no">{l('Нет — скрыт', 'No — hidden', 'Nē — paslēpts')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1 sm:col-span-full">
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
                                    className="w-full max-w-md rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
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
                        <Button variant="outline" onClick={onDiscardBannerChanges} disabled={saving || uploadingBannerMedia}>
                            {l('Сбросить изменения', 'Discard changes', 'Atmest izmaiņas')}
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
