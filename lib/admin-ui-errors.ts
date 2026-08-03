'use client'

export type AdminErrorKind = 'forbidden' | 'validation' | 'network' | 'server' | 'partial'

export type AdminUiError = { kind: AdminErrorKind; message: string; status?: number; context?: string }

export class AdminHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function adminFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(input, init) }
  catch (cause) { throw new AdminHttpError(0, cause instanceof Error ? cause.message : 'Network request failed') }
  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null
  if (!response.ok) throw new AdminHttpError(response.status, payload?.message ?? payload?.error ?? `HTTP ${response.status}`)
  return payload as T
}

export function classifyAdminError(error: unknown, context?: string): AdminUiError {
  const status = error instanceof AdminHttpError ? error.status : undefined
  if (status === 401 || status === 403) return { kind: 'forbidden', status, context, message: 'Недостаточно прав для загрузки этого раздела.' }
  if (status === 400 || status === 409 || status === 422) return { kind: 'validation', status, context, message: error instanceof Error ? error.message : 'Проверьте введённые данные.' }
  if (status && status >= 500) return { kind: 'server', status, context, message: 'Сервер временно не может обработать запрос.' }
  return { kind: 'network', status, context, message: 'Не удалось связаться с сервером. Проверьте подключение.' }
}

export function reportAdminError(error: unknown, context?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AdminUiError>('admin-ui-error', { detail: classifyAdminError(error, context) }))
}

export function reportAdminPartial(message: string, context?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AdminUiError>('admin-ui-error', { detail: { kind: 'partial', message, context } }))
}
