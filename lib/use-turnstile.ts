'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
  }) => string
  reset: (widgetId: string) => void
}

type TurnstileWindow = Window & typeof globalThis & {
  turnstile?: TurnstileApi
}

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function useTurnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const enabled = Boolean(siteKey)
  const [token, setToken] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)

  const render = useCallback(() => {
    if (!enabled || !containerRef.current || widgetIdRef.current !== null) {
      return
    }

    const browserWindow = window as TurnstileWindow
    if (!browserWindow.turnstile) {
      return
    }

    widgetIdRef.current = browserWindow.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (newToken: string) => setToken(newToken),
      'expired-callback': () => setToken(''),
      'error-callback': () => setToken('')
    })
  }, [enabled, siteKey])

  const reset = useCallback(() => {
    if (!enabled) {
      return
    }

    const browserWindow = window as TurnstileWindow
    if (browserWindow.turnstile && widgetIdRef.current) {
      browserWindow.turnstile.reset(widgetIdRef.current)
    }
    setToken('')
  }, [enabled])

  useEffect(() => {
    render()
  }, [render])

  return { enabled, token, containerRef, render, reset }
}
