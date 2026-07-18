'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'

type Payload = Record<string, unknown> & { type: 'vitals' | 'error' }

function send(payload: Payload): void {
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* never let telemetry throw */
  }
}

/**
 * First-party RUM: reports Core Web Vitals and uncaught client errors to
 * /api/telemetry (logged server-side). No third party, no cookies — a safety net
 * so production runtime issues are visible in the hosting logs.
 */
export default function TelemetryReporter(): null {
  useReportWebVitals((metric) => {
    send({ type: 'vitals', name: metric.name, value: metric.value, rating: metric.rating, path: location.pathname })
  })

  useEffect(() => {
    const onError = (e: ErrorEvent): void => {
      send({ type: 'error', message: e.message, stack: e.error?.stack, path: location.pathname })
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      const reason = e.reason as { message?: string; stack?: string } | undefined
      send({ type: 'error', message: reason?.message ?? String(e.reason), stack: reason?.stack, path: location.pathname })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
