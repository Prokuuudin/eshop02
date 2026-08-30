import { Button } from '@/components/ui/button';
import { ALL_COLS, REQUIRED_COLS, type Localize } from './import-config';

export function ImportExportSection({ l }: { l: Localize }): React.ReactElement {
    return (
        <>
{/* ══ EXPORT ══════════════════════════════════════════════════════════ */}
                <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                    <h2 className="text-base font-semibold text-foreground">
                        {l('Экспорт каталога', 'Catalog export', 'Kataloga eksports')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Скачайте все товары в формате CSV — включая базовые и добавленные через админку. Используйте этот файл как основу для редактирования и последующего импорта.',
                            'Download all products as CSV, including built-in products and those added in admin. Use this file as a basis for editing and reimporting.',
                            'Lejupielādējiet visus produktus CSV formātā, tostarp pamata un administrēšanā pievienotos. Izmantojiet šo failu rediģēšanai un atkārtotam importam.'
                        )}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <a href="/api/admin/export" download>
                            <Button>
                                {l(
                                    'Скачать каталог (CSV)',
                                    'Download catalog (CSV)',
                                    'Lejupielādēt katalogu (CSV)'
                                )}
                            </Button>
                        </a>
                        <a href="/api/admin/export?template=1" download>
                            <Button variant="outline">
                                {l(
                                    'Скачать шаблон (1 пример)',
                                    'Download template (1 example)',
                                    'Lejupielādēt veidni (1 piemērs)'
                                )}
                            </Button>
                        </a>
                    </div>
                    <div className="rounded-md bg-muted border border-border p-3">
                        <p className="text-xs font-medium text-foreground mb-1">
                            {l('Колонки в CSV:', 'CSV columns:', 'CSV kolonnas:')}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                            <span className="text-red-600 dark:text-red-400">
                                {REQUIRED_COLS.join(', ')}
                            </span>
                            {', '}
                            {ALL_COLS.slice(REQUIRED_COLS.length).join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {l(
                                'Красным — обязательные. Остальные — необязательные, их можно не включать в файл.',
                                'Required columns are red. The rest are optional and may be omitted.',
                                'Obligātās kolonnas ir sarkanas. Pārējās nav obligātas un tās var neiekļaut failā.'
                            )}{' '}
                            {l('Для', 'For', 'Laukam')} <code>badges</code>{' '}
                            {l(
                                'используйте разделитель',
                                'use the separator',
                                'izmantojiet atdalītāju'
                            )}{' '}
                            <code>;</code> ({l('например', 'for example', 'piemēram')}:{' '}
                            <code>sale;new</code>). {l('Категории:', 'Categories:', 'Kategorijas:')}{' '}
                            <code>hair, face, body, nails, equipment, new</code>.
                        </p>
                    </div>
                </section>
        </>
    );
}
