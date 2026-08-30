'use client';

import Image from 'next/image';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminLocale } from '@/lib/use-admin-locale';
import type { useAdminMediaPage } from './useAdminMediaPage';

export function fmtBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(iso: string, locale: string): string {
    return new Date(iso).toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

type State = ReturnType<typeof useAdminMediaPage>;

export default function MediaFileDetails({ state }: { state: State }): React.ReactElement {
    const { locale, l } = useAdminLocale();
    const { selected, setSelected, copied, setCopied, usageMap, replacing, replaceInputRef, onDelete } = state;

    return (
        <>
            {selected && (
                <div className="w-72 flex-shrink-0 rounded-xl border border-border bg-card p-4 space-y-4 sticky top-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground truncate">
                            {selected.name}
                        </p>
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            className="text-muted-foreground hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none ml-2 shrink-0"
                        >
                            ×
                        </button>
                    </div>
            
                    {/* Preview */}
                    <div className="aspect-square rounded-lg bg-muted border border-border flex items-center justify-center overflow-hidden">
                        {selected.isImage ? (
                            <Image
                                src={selected.path}
                                alt={selected.name}
                                width={288}
                                height={288}
                                unoptimized
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <span className="text-4xl font-bold text-muted-foreground uppercase">
                                {selected.ext}
                            </span>
                        )}
                    </div>
            
                    {/* Meta */}
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p>
                            {l('Размер:', 'Size:', 'Izmērs:')} <strong>{fmtBytes(selected.size)}</strong>
                        </p>
                        <p>
                            {l('Тип:', 'Type:', 'Tips:')} <strong>{selected.ext.toUpperCase()}</strong>
                        </p>
                        <p>{l('Изменён:', 'Modified:', 'Mainīts:')} {fmtDate(selected.modifiedAt, locale)}</p>
                    </div>
            
                    {/* Usage */}
                    {(() => {
                        const usedIn = usageMap.get(selected.path);
                        if (!usedIn?.length)
                            return (
                                <p className="text-xs text-muted-foreground">
                                    {l('Не используется в товарах', 'Not used in products', 'Netiek izmantots produktos')}
                                </p>
                            );
                        return (
                            <div className="text-xs">
                                <p className="font-medium text-primary dark:text-primary mb-1">
                                    {l(`Используется в ${usedIn.length} товарах:`, `Used in ${usedIn.length} products:`, `Izmantots ${usedIn.length} produktos:`)}
                                </p>
                                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                    {usedIn.map((t, i) => (
                                        <p
                                            key={i}
                                            className="text-muted-foreground truncate"
                                        >
                                            · {t}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
            
                    {/* Path copy */}
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">{l('Путь:', 'Path:', 'Ceļš:')}</p>
                        <code className="block text-xs bg-muted rounded px-2 py-1.5 break-all text-foreground">
                            {selected.path}
                        </code>
                        <Button
                            size="sm"
                            variant={copied === selected.path ? 'default' : 'outline'}
                            className="w-full text-xs"
                            onClick={() =>
                                void navigator.clipboard
                                    .writeText(selected.path)
                                    .then(() => {
                                        setCopied(selected.path);
                                        setTimeout(() => setCopied(null), 1500);
                                    })
                            }
                        >
                            {copied === selected.path
                                ? l('✓ Скопировано!', '✓ Copied!', '✓ Nokopēts!')
                                : l('Копировать путь', 'Copy path', 'Kopēt ceļu')}
                        </Button>
                    </div>
            
                    {/* Actions */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-border">
                        <a
                            href={selected.path}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1.5 text-xs rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            <Download className="h-3.5 w-3.5" /> {l('Открыть', 'Open', 'Atvērt')} ↗
                        </a>
            
                        {selected.isImage && (
                            <button
                                type="button"
                                disabled={replacing}
                                onClick={() => replaceInputRef.current?.click()}
                                className="text-xs rounded-lg border border-primary/50 dark:border-primary/50 px-3 py-1.5 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors disabled:opacity-50"
                            >
                                {replacing
                                    ? l('Замена...', 'Replacing...', 'Aizstāšana...')
                                    : l('Заменить файл (путь не изменится)', 'Replace file (path stays unchanged)', 'Aizstāt failu (ceļš nemainīsies)')}
                            </button>
                        )}
            
                        <Button
                            size="sm"
                            variant="destructive"
                            className="w-full text-xs"
                            onClick={() => void onDelete(selected)}
                        >
                            {l('Удалить файл', 'Delete file', 'Dzēst failu')}
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}

