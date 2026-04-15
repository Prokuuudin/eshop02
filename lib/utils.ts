import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Language } from '@/data/translations'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs))
}

export function getLocaleFromLanguage(language: Language): string {
  if (language === 'ru') return 'ru-RU'
  if (language === 'lv') return 'lv-LV'
  return 'en-US'
}

export function formatEuro(value: number, locale: string): string {
  return `€${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(value).toLocaleDateString(locale, options)
}

export default cn
