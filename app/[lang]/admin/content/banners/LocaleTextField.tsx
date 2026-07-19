'use client'

import { Input } from '@/components/ui/input'
import type { LocaleText } from '@/lib/locale-text'

const LOCALE_FIELD_LABELS = { ru: 'RU', en: 'EN', lv: 'LV' } as const

type LocaleTextFieldProps = {
  label: string
  value: LocaleText
  onChange: (next: LocaleText) => void
  placeholder?: string
}

export function LocaleTextField({ label, value, onChange, placeholder }: LocaleTextFieldProps): JSX.Element {
  return (
    <div className="admin-banners__locale-field space-y-1 sm:col-span-2">
      <label className="admin-banners__locale-label text-xs text-muted-foreground">{label}</label>
      <div className="admin-banners__locale-inputs grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(LOCALE_FIELD_LABELS) as Array<keyof typeof LOCALE_FIELD_LABELS>).map((lang) => (
          <Input
            key={lang}
            value={value[lang] ?? ''}
            onChange={(event) => onChange({ ...value, [lang]: event.target.value })}
            placeholder={`${LOCALE_FIELD_LABELS[lang]}${placeholder ? ` — ${placeholder}` : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
