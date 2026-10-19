'use client'

import { FormEvent, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

const COPY = {
  ru: {
    title: 'Пригласить сотрудника',
    intro: 'Учётная запись создаётся без административных и клиентских прав. Сотрудник сам установит пароль по одноразовой ссылке.',
    email: 'Рабочий email',
    name: 'Имя',
    reason: 'Причина приглашения',
    reasonHint: 'Например: назначение главным администратором',
    submit: 'Отправить приглашение',
    sending: 'Отправка…',
    success: 'Приглашение отправлено. Ссылка действует 24 часа и не отображается администратору.',
    resent: 'Новое приглашение отправлено; предыдущая ссылка недействительна.',
    exists: 'Учётная запись с этим email уже существует или приглашение уже принято.',
    failed: 'Не удалось отправить письмо. Повторная отправка создаст новую ссылку.',
    generic: 'Не удалось создать приглашение.',
  },
  en: {
    title: 'Invite staff member',
    intro: 'The account is created without admin or customer privileges. The employee sets their own password using a one-time link.',
    email: 'Work email',
    name: 'Name',
    reason: 'Reason for invitation',
    reasonHint: 'For example: appointment as chief administrator',
    submit: 'Send invitation',
    sending: 'Sending…',
    success: 'Invitation sent. The link expires in 24 hours and is never shown to the administrator.',
    resent: 'A new invitation was sent; the previous link is invalid.',
    exists: 'An account with this email already exists or the invitation was accepted.',
    failed: 'The email could not be sent. Resending will create a new link.',
    generic: 'Could not create the invitation.',
  },
  lv: {
    title: 'Uzaicināt darbinieku',
    intro: 'Konts tiek izveidots bez administratora vai klienta tiesībām. Darbinieks pats iestata paroli, izmantojot vienreizēju saiti.',
    email: 'Darba e-pasts',
    name: 'Vārds',
    reason: 'Uzaicinājuma iemesls',
    reasonHint: 'Piemēram: iecelšana par galveno administratoru',
    submit: 'Nosūtīt uzaicinājumu',
    sending: 'Nosūta…',
    success: 'Uzaicinājums nosūtīts. Saite derīga 24 stundas un administratoram netiek rādīta.',
    resent: 'Nosūtīts jauns uzaicinājums; iepriekšējā saite vairs nav derīga.',
    exists: 'Konts ar šo e-pastu jau pastāv vai uzaicinājums ir pieņemts.',
    failed: 'E-pastu neizdevās nosūtīt. Atkārtota nosūtīšana izveidos jaunu saiti.',
    generic: 'Neizdevās izveidot uzaicinājumu.',
  },
} as const

export default function AdminStaffInvite(): React.ReactElement {
  const { language } = useTranslation()
  const copy = COPY[language]
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/staff-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name.trim() || undefined, reason, language }),
      })
      const result = await response.json() as { ok?: boolean; error?: string; reinvited?: boolean }
      if (!response.ok) {
        const text = result.error === 'account_exists'
          ? copy.exists
          : result.error === 'email_send_failed'
            ? copy.failed
            : copy.generic
        setMessage({ kind: 'error', text })
        return
      }
      setMessage({ kind: 'success', text: result.reinvited ? copy.resent : copy.success })
      setEmail('')
      setName('')
      setReason('')
    } catch {
      setMessage({ kind: 'error', text: copy.generic })
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100'

  return (
    <section className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{copy.title}</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{copy.intro}</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {copy.email}
          <input className={inputClass} type="email" required maxLength={320} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {copy.name}
          <input className={inputClass} type="text" maxLength={200} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {copy.reason}
          <textarea className={inputClass} required minLength={5} maxLength={1000} rows={3} placeholder={copy.reasonHint} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? copy.sending : copy.submit}
        </button>
      </form>
      {message && (
        <p role="status" className={`mt-4 rounded-lg px-4 py-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
          {message.text}
        </p>
      )}
    </section>
  )
}
