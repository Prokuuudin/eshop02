'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export function usePersistentViewMode<T extends string>(
  storageKey: string,
  defaultValue: T,
  allowedValues: readonly T[],
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue)
  const allowedSignature = allowedValues.join('\u0000')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved && allowedValues.includes(saved as T)) {
        queueMicrotask(() => setValue(saved as T))
      }
    } catch {
      // Keep the deterministic server-rendered default when storage is unavailable.
    }
    // The signature tracks contents without requiring callers to memoize the array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, allowedSignature])

  const setPersistentValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      try { localStorage.setItem(storageKey, resolved) } catch {}
      return resolved
    })
  }, [storageKey])

  return [value, setPersistentValue]
}
