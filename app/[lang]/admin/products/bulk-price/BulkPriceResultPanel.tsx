import type { useBulkPricePage } from './useBulkPricePage'

type PageState = ReturnType<typeof useBulkPricePage>
type Props = {
  state: Pick<PageState, 'lastResult' | 'saving' | 'prepareFailedRetry' | 'l'>
}

export default function BulkPriceResultPanel({ state }: Props): React.ReactElement | null {
  const { lastResult, saving, prepareFailedRetry, l } = state
  if (!lastResult) return null

  const failedItems = lastResult.items.filter((item) => item.status === 'err')

  return (
    <div
      role="status"
      className={`rounded-xl border p-4 ${lastResult.err === 0
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
        : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'}`}
    >
      <div className="font-semibold">
        {lastResult.kind === 'apply'
          ? l('Изменение цен завершено', 'Price change completed', 'Cenu maiņa pabeigta')
          : l('Возврат цен завершён', 'Price revert completed', 'Cenu atjaunošana pabeigta')}
      </div>
      <p className="mt-1 text-sm">
        {l('Успешно:', 'Successful:', 'Veiksmīgi:')} {lastResult.ok} {l('из', 'of', 'no')} {lastResult.items.length}.
        {lastResult.err > 0 && l(
          ` Не удалось: ${lastResult.err}. Причины указаны ниже.`,
          ` Failed: ${lastResult.err}. Reasons are listed below.`,
          ` Neizdevās: ${lastResult.err}. Iemesli norādīti zemāk.`
        )}
      </p>
      {lastResult.kind === 'apply' && lastResult.err > 0 && (
        <button
          type="button"
          onClick={() => prepareFailedRetry(lastResult)}
          disabled={saving}
          className="mt-3 rounded-md border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          {l('Обновить данные и проверить неудавшиеся товары', 'Refresh and review failed products', 'Atjaunināt un pārbaudīt neveiksmīgos produktus')}
        </button>
      )}
      {failedItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {failedItems.map((item) => (
            <li key={item.id}><span className="font-medium">{item.title}</span>: {item.error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
