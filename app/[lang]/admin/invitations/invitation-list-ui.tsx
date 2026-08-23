import { Button } from '@/components/ui/button'
import { INVITATIONS_PAGE_SIZE as PAGE_SIZE, type SortDir } from './invitation-models'

type Translate = (ru: string, en: string, lv: string) => string

export function SortArrow({ active, dir }: { active: boolean; dir?: SortDir }): React.ReactElement {
    return <span className={`ml-1 text-[10px] ${active ? 'text-foreground' : 'text-gray-300 dark:text-gray-600'}`}>
        {active && dir === 'desc' ? '▼' : '▲'}
    </span>
}

export function InvitationPager({ page, pageCount, total, setPage, l }: {
    page: number
    pageCount: number
    total: number
    setPage: (page: number) => void
    l: Translate
}): React.ReactElement {
    const start = page * PAGE_SIZE + 1
    const end = Math.min((page + 1) * PAGE_SIZE, total)
    return <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{l(`${start}–${end} из ${total.toLocaleString('ru-RU')}`, `${start}–${end} of ${total.toLocaleString('ru-RU')}`, `${start}–${end} no ${total.toLocaleString('ru-RU')}`)}</span>
        <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}>{l('Назад', 'Prev', 'Atpakaļ')}</Button>
            <span>{page + 1} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, page + 1))}>{l('Вперёд', 'Next', 'Uz priekšu')}</Button>
        </div>
    </div>
}
