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

type UseTurnstileResult = {
  enabled: boolean
  token: string
  setContainer: (node: HTMLDivElement | null) => void
  render: () => void
  reset: () => void
}

export function useTurnstile(): UseTurnstileResult {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  const enabled = Boolean(siteKey)
  const [token, setToken] = useState('')
  const containerElementRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const setContainer = useCallback((node: HTMLDivElement | null): void => {
    containerElementRef.current = node
  }, [])

  const render = useCallback(() => {
    if (!enabled || !containerElementRef.current || widgetIdRef.current !== null) {
      return
    }

    const browserWindow = window as TurnstileWindow
    if (!browserWindow.turnstile) {
      return
    }

    widgetIdRef.current = browserWindow.turnstile.render(containerElementRef.current, {
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

  return { enabled, token, setContainer, render, reset }
}
