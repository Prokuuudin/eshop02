import type { EmailTemplate } from './email-template-model'

export async function loadEmailTemplates(): Promise<EmailTemplate[]> {
  const response = await fetch('/api/admin/email-templates')
  if (!response.ok) throw new Error('load_failed')

  const payload: unknown = await response.json()
  return Array.isArray(payload) ? payload as EmailTemplate[] : []
}

export async function saveEmailTemplate(id: string, subject: string, body: string): Promise<EmailTemplate> {
  const response = await fetch(`/api/admin/email-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, body }),
  })
  if (!response.ok) throw new Error('save_failed')
  return response.json() as Promise<EmailTemplate>
}

export async function sendEmailTemplateTest(id: string, to: string): Promise<boolean> {
  const response = await fetch(`/api/admin/email-templates/${id}/send-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  })
  return response.ok
}
