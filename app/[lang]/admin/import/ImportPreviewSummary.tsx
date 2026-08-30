import type { useAdminImportPage } from './useAdminImportPage'
import type { Localize } from './import-config'

type ImportState = ReturnType<typeof useAdminImportPage>
type Summary = NonNullable<ImportState['previewResult']>['summary']

const ITEMS: Array<{
  key: keyof Summary
  label: Parameters<Localize>
  className: string
}> = [
  { key: 'create', label: ['Создать', 'Create', 'Izveidot'], className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  { key: 'update', label: ['Обновить', 'Update', 'Atjaunināt'], className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { key: 'skip', label: ['Пропустить', 'Skip', 'Izlaist'], className: 'bg-muted text-muted-foreground' },
  { key: 'error', label: ['Ошибок', 'Errors', 'Kļūdas'], className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
]

export function ImportPreviewSummary({ summary, l }: { summary: Summary; l: Localize }): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {ITEMS.map(({ key, label, className }) => summary[key] > 0 && (
        <span key={key} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${className}`}>
          {l(...label)}: {summary[key]}
        </span>
      ))}
    </div>
  )
}
