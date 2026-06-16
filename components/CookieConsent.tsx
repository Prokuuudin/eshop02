'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

export type CookieConsentValue = {
  necessary: true
  analytics: boolean
  marketing: boolean
  ts: number
}

const CONSENT_KEY = 'cookie_consent'

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CookieConsentValue
  } catch {
    return null
  }
}

function saveConsent(analytics: boolean, marketing: boolean): void {
  const value: CookieConsentValue = { necessary: true, analytics, marketing, ts: Date.now() }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(value))
}

export default function CookieConsent() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    if (getCookieConsent()) return
    const timer = setTimeout(() => {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    setShown(false)
    setTimeout(() => setVisible(false), 300)
  }

  const acceptAll = () => {
    saveConsent(true, true)
    dismiss()
    setConfigOpen(false)
  }

  const necessaryOnly = () => {
    saveConsent(false, false)
    dismiss()
  }

  const saveSelection = () => {
    saveConsent(analytics, marketing)
    dismiss()
    setConfigOpen(false)
  }

  if (!visible) return null

  return (
    <>
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-900 shadow-xl transition-all duration-300 ease-out ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <p className="flex-1 text-sm text-slate-300">{t('cookie.banner.text')}</p>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              size="sm"
              onClick={acceptAll}
              className="bg-white text-slate-900 hover:bg-slate-100 border-0"
            >
              {t('cookie.banner.acceptAll')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfigOpen(true)}
              className="border-slate-400 text-white hover:bg-slate-700"
            >
              {t('cookie.banner.configure')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={necessaryOnly}
              className="text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              {t('cookie.banner.necessaryOnly')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cookie.configure.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.necessary')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.necessaryDesc')}</p>
              </div>
              <Switch checked disabled aria-label={t('cookie.configure.necessary')} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.analytics')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.analyticsDesc')}</p>
              </div>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
                aria-label={t('cookie.configure.analytics')}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('cookie.configure.marketing')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cookie.configure.marketingDesc')}</p>
              </div>
              <Switch
                checked={marketing}
                onCheckedChange={setMarketing}
                aria-label={t('cookie.configure.marketing')}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={saveSelection}>
              {t('cookie.configure.save')}
            </Button>
            <Button onClick={acceptAll}>
              {t('cookie.configure.acceptAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
