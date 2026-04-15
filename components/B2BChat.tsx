'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'

type ChatMessage = {
  id: string
  companyId: string
  from: 'client' | 'manager'
  text: string
  createdAt: string
  authorName?: string
}

export default function B2BChat() {
  const user = getCurrentUser()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const companyId = user?.companyId

  const manager = useMemo(
    () => ({
      name: 'Анна Петрова',
      phone: '+7 (999) 123-45-67',
      email: 'account.manager@eshop02.local'
    }),
    []
  )

  const loadMessages = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/account-manager?companyId=${encodeURIComponent(companyId)}`, {
        cache: 'no-store'
      })
      const data = (await response.json()) as { messages?: ChatMessage[]; error?: string }
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось загрузить сообщения')
      }
      setMessages(data.messages || [])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка загрузки чата', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, showToast])

  useEffect(() => {
    if (!open || !companyId) return
    void loadMessages()
    const timer = setInterval(() => {
      void loadMessages()
    }, 10000)

    return () => clearInterval(timer)
  }, [open, companyId, loadMessages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    const trimmed = text.trim()
    if (!trimmed) return

    setSending(true)
    try {
      const response = await fetch('/api/account-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          text: trimmed,
          from: 'client',
          authorName: user?.name || user?.email || 'Client'
        })
      })
      const data = (await response.json()) as { message?: ChatMessage; error?: string }
      if (!response.ok) {
        throw new Error(data.error || 'Не удалось отправить сообщение')
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message as ChatMessage])
      }
      setText('')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ошибка отправки', 'error')
    } finally {
      setSending(false)
    }
  }

  if (!companyId) return null

  return (
    <div className="fixed right-4 bottom-4 z-50">
      {open ? (
        <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-emerald-50 dark:bg-emerald-900/30">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">B2B Поддержка</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{manager.name}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{manager.phone}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{manager.email}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-xs text-gray-600 dark:text-gray-300">Закрыть</button>
            </div>
          </div>

          <div className="h-72 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-gray-950">
            {loading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Загрузка...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Начните диалог с аккаунт-менеджером</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded px-2 py-1.5 text-xs ${
                    message.from === 'client'
                      ? 'ml-auto bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                      : 'mr-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className="mt-1 opacity-70">{new Date(message.createdAt).toLocaleString('ru-RU')}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs"
              placeholder="Сообщение менеджеру"
            />
            <Button size="sm" type="submit" disabled={sending || !text.trim()}>
              Отправить
            </Button>
          </form>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)} className="shadow-lg">
          Чат с менеджером
        </Button>
      )}
    </div>
  )
}
