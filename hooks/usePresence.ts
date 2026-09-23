'use client'

import { useEffect, useState } from 'react'

/**
 * Keeps a conditionally rendered overlay mounted for `exitMs` after `isOpen`
 * turns false, so it can play an exit animation before unmounting.
 */
export function usePresence(isOpen: boolean, exitMs: number): { rendered: boolean; closing: boolean } {
    const [rendered, setRendered] = useState(isOpen)

    // Mount immediately on open (state adjustment during render, no extra effect pass).
    if (isOpen && !rendered) setRendered(true)

    useEffect(() => {
        if (isOpen || !rendered) return
        const timer = window.setTimeout(() => setRendered(false), exitMs)
        return () => window.clearTimeout(timer)
    }, [isOpen, rendered, exitMs])

    return { rendered, closing: rendered && !isOpen }
}
