'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useI18n, useTranslation } from '@/lib/i18n-context'
import { Language } from '@/data/translations'
import { Button } from './ui/button'

const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'lv', name: 'Latviešu', flag: '🇱🇻' }
]

export default function LanguageSwitcher() {
  const { language, setLanguage } = useI18n()
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const currentLang = LANGUAGES.find(l => l.code === language)

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen])

  return (
    <TooltipProvider>
      <div className="relative" ref={rootRef}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsOpen(!isOpen)}
              className="px-3 py-2 text-lg font-bold flex items-center gap-2"
              variant="ghost"
              aria-label="Change language"
            >
              <span className="uppercase text-base font-bold">{currentLang?.code}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('languageSwitcher.tooltip')}</TooltipContent>
        </Tooltip>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 ${
                  language === lang.code ? 'bg-gray-50 dark:bg-gray-800 font-semibold' : ''
                } text-gray-900 dark:text-gray-100`}
              >
                <span className="uppercase text-base font-bold">{lang.code}</span>
                <span className="ml-1">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
