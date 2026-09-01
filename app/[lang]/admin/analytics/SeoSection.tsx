import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnalyticsPagination, Empty, LoadError, type SeoProduct } from './analytics-shared';
import type { ReactElement } from 'react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';

type SeoIssue = 'all' | 'metaTitle' | 'metaDesc' | 'image' | 'imageAlt' | 'translations' | 'duplicate';
type SeoCounts = Record<SeoIssue, number>;
const SEO_EXPLANATION_STORAGE_KEY = 'admin-analytics-seo-explanation-open';

export default function SeoSection(): ReactElement {
    const { l } = useAdminLocale();
    const [products, setProducts] = useState<SeoProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [catalogTotal, setCatalogTotal] = useState(0);
    const [counts, setCounts] = useState<SeoCounts>({ all: 0, metaTitle: 0, metaDesc: 0, image: 0, imageAlt: 0, translations: 0, duplicate: 0 });
    const [issueFilter, setIssueFilter] = useState<SeoIssue>('all');
    const [query, setQuery] = useState('');
    const [pageSize, setPageSize] = useState(25);
    const [urlReady, setUrlReady] = useState(false);
    const [explanationOpen, setExplanationOpen] = useState(true);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) setExplanationOpen(window.localStorage.getItem(SEO_EXPLANATION_STORAGE_KEY) !== 'false');
        });
        return () => { cancelled = true; };
    }, []);

    const toggleExplanation = (): void => {
        setExplanationOpen((open) => {
            const next = !open;
            window.localStorage.setItem(SEO_EXPLANATION_STORAGE_KEY, String(next));
            return next;
        });
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlPage = Number(params.get('seoPage'));
        const urlSize = Number(params.get('seoPageSize'));
        const urlIssue = params.get('seoIssue');
        queueMicrotask(() => {
            if (urlPage > 0) setPage(urlPage);
            if ([25, 50, 100].includes(urlSize)) setPageSize(urlSize);
            if (['all', 'metaTitle', 'metaDesc', 'image', 'imageAlt', 'translations', 'duplicate'].includes(urlIssue ?? '')) setIssueFilter(urlIssue as SeoIssue);
            setQuery(params.get('seoSearch') ?? '');
            setUrlReady(true);
        });
    }, []);

    useEffect(() => {
        if (!urlReady) return;
        const url = new URL(window.location.href);
        [['seoPage', String(page)], ['seoPageSize', String(pageSize)], ['seoIssue', issueFilter], ['seoSearch', query.trim()]].forEach(([key, value]) => value && value !== 'all' ? url.searchParams.set(key, value) : url.searchParams.delete(key));
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }, [issueFilter, page, pageSize, query, urlReady]);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        if (!urlReady) return () => controller.abort();
        const timeout = setTimeout(() => {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), issue: issueFilter });
        if (query.trim()) params.set('search', query.trim());
        fetch(`/api/admin/analytics/seo?${params}`, { signal: controller.signal, cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status_${r.status}`))))
            .then((data: { products: Omit<SeoProduct, 'issueCount'>[]; total: number; catalogTotal: number; counts: typeof counts }) => {
                const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
                if (page > lastPage) { setPage(lastPage); return; }
                const mapped: SeoProduct[] = data.products.map((p) => ({
                    ...p,
                    title: p.title || '—',
                    brand: p.brand || '—',
                    category: p.category || '—',
                    issueCount: (p.hasMetaTitle && p.validMetaTitleLength ? 0 : 1) + (p.hasMetaDesc && p.validMetaDescLength ? 0 : 1) + (p.hasImage ? 0 : 1) + (p.hasImageAlt ? 0 : 1) + (p.hasTranslations ? 0 : 1) + (p.duplicateMeta ? 1 : 0),
                }));
                if (active) {
                    setProducts(mapped);
                    setTotal(data.total);
                    setCatalogTotal(data.catalogTotal);
                    setCounts(data.counts);
                    setError(false);
                }
            })
            .catch((e) => { if (active && (e as Error).name !== 'AbortError') { setProducts([]); setError(true); } })
            .finally(() => { if (active) setLoading(false); });
        }, query.trim() ? 250 : 0);
        return () => { active = false; clearTimeout(timeout); controller.abort(); };
    }, [issueFilter, page, pageSize, query, reloadKey, urlReady]);

    if (loading)
        return <div className="py-16 text-center text-sm text-muted-foreground">{l('Загрузка каталога...', 'Loading catalog...', 'Kataloga ielāde...')}</div>;

    if (error)
        return <LoadError text={l('Не удалось загрузить SEO-отчёт.', 'Failed to load the SEO report.', 'Neizdevās ielādēt SEO pārskatu.')} retryLabel={l('Повторить', 'Retry', 'Mēģināt vēlreiz')} onRetry={() => { setLoading(true); setError(false); setReloadKey((key) => key + 1); }} />;

    if (catalogTotal === 0)
        return <Empty text={l('В каталоге пока нет товаров.', 'There are no products in the catalog yet.', 'Katalogā vēl nav produktu.')} />;

    const allOk = !query.trim() && catalogTotal > 0 && counts.all === 0;
    const seoReturnParams = new URLSearchParams({ tab: 'seo' });
    if (page > 1) seoReturnParams.set('seoPage', String(page));
    if (pageSize !== 25) seoReturnParams.set('seoPageSize', String(pageSize));
    if (issueFilter !== 'all') seoReturnParams.set('seoIssue', issueFilter);
    if (query.trim()) seoReturnParams.set('seoSearch', query.trim());
    const seoReturnTo = `/admin/analytics?${seoReturnParams.toString()}`;

    return (
        <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    {
                        key: 'all' as const,
                        label: l('С проблемами', 'With issues', 'Ar problēmām'),
                        color: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10',
                        text: 'text-red-700 dark:text-red-300',
                    },
                    {
                        key: 'metaTitle' as const,
                        label: l('Нет metaTitle', 'Missing metaTitle', 'Nav metaTitle'),
                        color: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10',
                        text: 'text-orange-700 dark:text-orange-300',
                    },
                    {
                        key: 'metaDesc' as const,
                        label: l('Нет metaDescription', 'Missing metaDescription', 'Nav metaDescription'),
                        color: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10',
                        text: 'text-yellow-700 dark:text-yellow-300',
                    },
                    {
                        key: 'image' as const,
                        label: l('Нет изображения', 'Missing image', 'Nav attēla'),
                        color: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
                        text: 'text-gray-700 dark:text-gray-300',
                    },
                    { key: 'imageAlt' as const, label: l('Нет описания превью (Alt)', 'Missing preview description (Alt)', 'Nav priekšskatījuma apraksta (Alt)'), color: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10', text: 'text-blue-700 dark:text-blue-300' },
                    { key: 'translations' as const, label: l('Нет названий EN/LV', 'Missing EN/LV titles', 'Nav EN/LV nosaukumu'), color: 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/10', text: 'text-violet-700 dark:text-violet-300' },
                    { key: 'duplicate' as const, label: l('Дубликаты meta', 'Duplicate metadata', 'Meta dublikāti'), color: 'border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-900/10', text: 'text-pink-700 dark:text-pink-300' },
                ].map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        onClick={() => { setIssueFilter(issueFilter === s.key ? 'all' : s.key); setPage(1); setLoading(true); }}
                        className={[
                            'rounded-xl border p-4 text-left transition-colors',
                            s.color,
                            issueFilter === s.key ? 'ring-2 ring-primary ring-offset-1' : '',
                        ].join(' ')}
                    >
                        <p className={`text-2xl font-bold ${s.text}`}>{counts[s.key]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </button>
                ))}
            </div>

            <div className="rounded-lg border border-border bg-muted/40 text-sm text-foreground">
                <button type="button" onClick={toggleExplanation} aria-expanded={explanationOpen} className="group flex w-full items-baseline gap-2 px-4 py-3 text-left">
                    <span className="text-sm font-semibold leading-5">{l('Как читать SEO-отчёт', 'How to read the SEO report', 'Kā lasīt SEO pārskatu')}</span>
                    <span className="text-xs font-medium leading-5 text-primary underline-offset-4 group-hover:underline">
                        {explanationOpen
                            ? l('Свернуть пояснения', 'Hide explanation', 'Paslēpt skaidrojumu')
                            : l('Показать пояснения', 'Show explanation', 'Rādīt skaidrojumu')}
                    </span>
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 self-center text-primary transition-transform ${explanationOpen ? 'rotate-180' : ''}`} />
                </button>
                {explanationOpen && <div className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-muted-foreground">
                    <p>{l(
                        'Цветные карточки показывают, сколько товаров имеют каждый тип SEO-проблемы с учётом текущего поиска. Один товар может попасть сразу в несколько карточек, поэтому их значения не нужно складывать. Нажмите на карточку, чтобы отфильтровать таблицу.',
                        'The colored cards show how many products have each type of SEO issue within the current search. A product can appear in several cards, so their values should not be added together. Select a card to filter the table.',
                        'Krāsainās kartītes rāda, cik precēm pašreizējā meklēšanā ir katrs SEO problēmas veids. Viena prece var būt vairākās kartītēs, tāpēc to vērtības nav jāsaskaita. Noklikšķiniet uz kartītes, lai filtrētu tabulu.'
                    )}</p>
                    <p>{l(
                        'Зелёная галочка означает, что проверка пройдена; красный крестик — поле отсутствует или заполнено некорректно. Число в колонке «Проблем» показывает общее количество замечаний по товару.',
                        'A green check means the test passed; a red cross means the field is missing or invalid. The number in the “Issues” column is the total number of findings for that product.',
                        'Zaļš ķeksītis nozīmē, ka pārbaude ir izturēta; sarkans krustiņš — lauka nav vai tas aizpildīts nepareizi. Skaitlis kolonnā “Problēmas” rāda kopējo atrasto problēmu skaitu precei.'
                    )}</p>
                    <p>{l(
                        'metaTitle считается корректным при длине 10–60 символов, metaDescription — 50–160 символов. «Фото» проверяет наличие изображения, «Описание превью (Alt)» — текст для изображения в превью ссылки (OG; без фото показывается «—»), EN/LV — наличие английского и латышского названий, «Дубли» — повторяющиеся метаданные у разных товаров.',
                        'A valid metaTitle is 10–60 characters and a valid metaDescription is 50–160 characters. “Image” checks for a product image, “Preview description (Alt)” checks the text for the link preview image (OG; “—” is shown when there is no image), EN/LV checks English and Latvian titles, and “Duplicates” identifies metadata repeated across products.',
                        'Derīgs metaTitle ir 10–60 rakstzīmes, bet metaDescription — 50–160 rakstzīmes. “Attēls” pārbauda preces attēla esamību, “Priekšskatījuma apraksts (Alt)” — saites priekšskatījuma attēla tekstu (OG; ja attēla nav, rāda “—”), EN/LV — angļu un latviešu nosaukumus, bet “Dublikāti” atrod vairākām precēm atkārtotus metadatus.'
                    )}</p>
                    <p>{l(
                        'Начинайте с товаров с наибольшим числом проблем и высокой коммерческой важностью. Нажмите «Редактировать», исправьте поля товара и затем вернитесь к отчёту для повторной проверки. CSV-экспорт сохраняет текущий фильтр и поиск.',
                        'Start with products that have the most issues and the highest commercial importance. Select “Edit”, correct the product fields, then return to the report to verify again. CSV export preserves the current filter and search.',
                        'Sāciet ar precēm, kurām ir visvairāk problēmu un lielākā komerciālā nozīme. Noklikšķiniet uz “Rediģēt”, izlabojiet preces laukus un pēc tam atgriezieties pārskatā atkārtotai pārbaudei. CSV eksports saglabā pašreizējo filtru un meklēšanu.'
                    )}</p>
                </div>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={l('Поиск по товару, бренду или категории…', 'Search by product, brand or category…', 'Meklēt pēc produkta, zīmola vai kategorijas…')} className="max-w-sm" />
                <a href={`/api/admin/analytics/seo?issue=${issueFilter}&search=${encodeURIComponent(query.trim())}&export=csv`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">{l('Экспорт CSV', 'Export CSV', 'Eksportēt CSV')}</a>
            </div>

            {allOk && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                    {l(`Все ${catalogTotal} товаров заполнены корректно. SEO-пробелов нет.`, `All ${catalogTotal} products are complete. No SEO gaps found.`, `Visi ${catalogTotal} produkti ir aizpildīti pareizi. SEO trūkumu nav.`)}
                </div>
            )}

            {products.length > 0 && (
                <div id="seo-results" className="scroll-mt-4 overflow-auto rounded-xl border border-border">
                    <table className="min-w-full text-sm bg-card">
                        <thead className="bg-muted sticky top-0">
                            <tr>
                                <th className="sticky left-0 z-20 min-w-52 bg-muted px-4 py-3 text-left font-medium text-muted-foreground">
                                    {l('Товар', 'Product', 'Produkts')}
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    {l('Бренд / Категория', 'Brand / Category', 'Zīmols / Kategorija')}
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">
                                    metaTitle
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">
                                    metaDescription
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    {l('Фото', 'Image', 'Attēls')}
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{l('Описание превью (Alt)', 'Preview description (Alt)', 'Priekšskatījuma apraksts (Alt)')}</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">EN/LV</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{l('Дубли', 'Duplicates', 'Dublikāti')}</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    {l('Проблем', 'Issues', 'Problēmas')}
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {products.map((p) => (
                                <tr
                                    key={p.id}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
                                    <td className="sticky left-0 max-w-xs bg-card px-4 py-2.5 font-medium text-foreground">
                                        <span className="truncate block">{p.title}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                        <p>{p.brand}</p>
                                        <p className="text-xs capitalize">{p.category}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasMetaTitle && p.validMetaTitleLength ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasMetaDesc && p.validMetaDescLength ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        {p.hasImage ? (
                                            <span className="text-emerald-500">✓</span>
                                        ) : (
                                            <span className="text-red-500 font-semibold">✗</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-center" title={l('Описание изображения для превью ссылки (OG, Alt)', 'Link preview image description (OG, Alt)', 'Saites priekšskatījuma attēla apraksts (OG, Alt)')}>
                                        {!p.hasImage ? <span className="text-muted-foreground">—</span> : <span className={p.hasImageAlt ? 'text-emerald-500' : 'font-semibold text-red-500'}>{p.hasImageAlt ? '✓' : '✗'}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-center" title={l('Переводы EN/LV', 'EN/LV translations', 'EN/LV tulkojumi')}>
                                        <span className={p.hasTranslations ? 'text-emerald-500' : 'font-semibold text-red-500'}>{p.hasTranslations ? '✓' : '✗'}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center" title={l('Дубликаты метаданных', 'Duplicate metadata', 'Meta dublikāti')}>
                                        <span className={p.duplicateMeta ? 'font-semibold text-red-500' : 'text-emerald-500'}>{p.duplicateMeta ? '✗' : '✓'}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                p.issueCount >= 4
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                    : p.issueCount >= 2
                                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                            }`}
                                        >
                                            {p.issueCount}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <Link
                                            href={`/admin/products/${encodeURIComponent(p.id)}?from=seo&returnTo=${encodeURIComponent(seoReturnTo)}`}
                                            className="text-xs text-primary hover:underline dark:text-primary whitespace-nowrap"
                                        >
                                            {l('Редактировать', 'Edit', 'Rediģēt')} →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {total === 0 && !allOk && <Empty text={l('По выбранному фильтру проблем нет.', 'No issues match the selected filter.', 'Atlasītajam filtram problēmu nav.')} />}

            <AnalyticsPagination page={page} pageSize={pageSize} total={total} loading={loading} labels={{ previous: l('Назад', 'Previous', 'Atpakaļ'), next: l('Вперёд', 'Next', 'Tālāk'), page: l('Страница', 'Page', 'Lapa'), of: l('из', 'of', 'no'), rows: l('Строк:', 'Rows:', 'Rindas:') }} onPageChange={(nextPage) => { setPage(nextPage); setLoading(true); }} onPageSizeChange={(size) => { setPageSize(size); setPage(1); setLoading(true); }} scrollTargetId="seo-results" />

            {catalogTotal > 0 && !query.trim() && (
                <p className="text-xs text-muted-foreground">
                    {l('Всего в каталоге:', 'Total in catalog:', 'Kopā katalogā:')} {catalogTotal} {l('товаров · Заполнены корректно:', 'products · Complete:', 'produkti · Pareizi aizpildīti:')}{' '}
                    {catalogTotal - counts.all}
                </p>
            )}
        </div>
    );
}
