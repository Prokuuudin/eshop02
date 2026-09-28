import { escapeHtml } from '@/lib/escape-html'
import { logOperationalEvent } from '@/lib/observability'

export interface SyncFailureAlert {
  at: Date
  runId?: string
  reason: string
  hardFailures?: string[]
  warnings?: string[]
  metrics?: Record<string, unknown>
  xmlSha256?: string
}

type SendEmail = (to: string, subject: string, html: string) => Promise<void>

async function defaultSendEmail(to: string, subject: string, html: string): Promise<void> {
  const { sendEmail } = await import('@/lib/mailer')
  await sendEmail(to, subject, html)
}

/**
 * Sends one failure email for a scheduled ERP sync. Never throws: a missing
 * recipient or a mailer failure is logged and must not mask the sync error.
 */
export async function sendSyncFailureAlert(
  alert: SyncFailureAlert,
  deps: { env?: NodeJS.ProcessEnv; sendEmail?: SendEmail } = {},
): Promise<'sent' | 'skipped' | 'failed'> {
  const to = (deps.env ?? process.env).SYNC_ALERT_EMAIL?.trim()
  if (!to) {
    logOperationalEvent({ event: 'erp_sync_alert_skipped', level: 'warn', reason: 'SYNC_ALERT_EMAIL not set', runId: alert.runId })
    return 'skipped'
  }

  const lines = [
    'Hourly ERP FULL sync failed.',
    `Time: ${alert.at.toISOString()}`,
    `SyncRun: ${alert.runId ?? '(not created)'}`,
    `Reason: ${alert.reason}`,
    ...(alert.xmlSha256 ? [`XML SHA-256: ${alert.xmlSha256}`] : []),
    ...(alert.hardFailures?.length ? ['', 'Preflight HARD failures:', ...alert.hardFailures.map(item => `- ${item}`)] : []),
    ...(alert.warnings?.length ? ['', 'Warnings:', ...alert.warnings.map(item => `- ${item}`)] : []),
    ...(alert.metrics ? ['', 'Metrics:', JSON.stringify(alert.metrics, null, 2)] : []),
    '',
    'No Product rows were written by a blocked preflight. See SyncRun.errorSample for details.',
  ]
  const html = `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(lines.join('\n'))}</pre>`

  try {
    await (deps.sendEmail ?? defaultSendEmail)(to, `[hairshoppro] ERP sync failed ${alert.at.toISOString()}`, html)
    logOperationalEvent({ event: 'erp_sync_alert_sent', runId: alert.runId })
    return 'sent'
  } catch (err) {
    logOperationalEvent({ event: 'erp_sync_alert_failed', level: 'error', runId: alert.runId, error: err instanceof Error ? err.message : String(err) })
    return 'failed'
  }
}
