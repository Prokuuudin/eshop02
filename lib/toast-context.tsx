'use client'

import React from 'react'

type ToastType = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  message: string
  type: ToastType
}

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const removeToast = React.useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = React.useCallback((message: string, type: ToastType = 'info'): void => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, message, type }])

    window.setTimeout(() => {
      removeToast(id)
    }, 2600)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed right-4 bottom-4 z-[12000] space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[240px] max-w-sm rounded-md px-4 py-3 text-sm shadow-lg border ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200'
                : toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/40 dark:border-red-700 dark:text-red-200'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-700 dark:text-indigo-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
