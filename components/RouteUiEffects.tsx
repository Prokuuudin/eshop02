'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import SmoothScrollHandler from './SmoothScrollHandler'
import PageLoader from './PageLoader'

export default function RouteUiEffects() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let fallbackTimer: number | undefined

    const handleStart = (): void => setLoading(true)
    const handleComplete = (): void => {
      setLoading(false)
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
      }
    }

    const handleStartWithFallback = (): void => {
      handleStart()
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
      }

      // Safety net: never keep the full-screen loader forever.
      fallbackTimer = window.setTimeout(() => {
        setLoading(false)
      }, 3000)
    }

    window.addEventListener('nextRouteStart', handleStartWithFallback)
    window.addEventListener('nextRouteDone', handleComplete)

    return () => {
      window.removeEventListener('nextRouteStart', handleStartWithFallback)
      window.removeEventListener('nextRouteDone', handleComplete)
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer)
      }
    }
  }, [])

  useEffect(() => {
    // Route changed -> loader must be completed.
    setLoading(false)
  }, [pathname])

  return (
    <>
      <SmoothScrollHandler />
      <PageLoader show={loading} />
    </>
  )
}
