import type { Localize } from './import-config';

export function ImportHints({ l }: { l: Localize }): React.ReactElement {
    return (
        <>
{/* ══ HINTS ═══════════════════════════════════════════════════════════ */}
                <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">
                        {l('Сценарии использования', 'Use cases', 'Lietošanas scenāriji')}
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>
                            {l(
                                'Первичная загрузка каталога: режим',
                                'Initial catalog upload: use',
                                'Sākotnējā kataloga augšupielāde: izmantojiet'
                            )}{' '}
                            <strong>create</strong>
                        </li>
                        <li>
                            {l(
                                'Массовое обновление цен/остатков: скачайте экспорт, отредактируйте нужные колонки, загрузите в режиме',
                                'Bulk price/inventory update: download the export, edit the required columns, and upload using',
                                'Cenu/krājumu masveida atjaunināšana: lejupielādējiet eksportu, rediģējiet vajadzīgās kolonnas un augšupielādējiet ar'
                            )}{' '}
                            <strong>update</strong>
                        </li>
                        <li>
                            {l(
                                'Синхронизация с прайс-листом поставщика: режим',
                                'Supplier price list synchronization: use',
                                'Sinhronizācija ar piegādātāja cenrādi: izmantojiet'
                            )}{' '}
                            <strong>upsert</strong>
                        </li>
                    </ul>
                </section>
        </>
    );
}
