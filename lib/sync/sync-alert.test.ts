import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendSyncFailureAlert } from './sync-alert'

const ALERT = {
  at: new Date('2026-09-28T10:00:00.000Z'),
  runId: 'run-1',
  reason: 'preflight HARD checks failed (1)',
  hardFailures: ['linked ratio 50.00% < 90.00% <script>'],
  metrics: { rows: 16176 },
  xmlSha256: 'a'.repeat(64),
}

afterEach(() => vi.restoreAllMocks())

describe('sendSyncFailureAlert', () => {
  it('sends one escaped email with run id, reason and metrics', async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined)
    const result = await sendSyncFailureAlert(ALERT, { env: { SYNC_ALERT_EMAIL: 'ops@example.test' } as unknown as NodeJS.ProcessEnv, sendEmail })
    expect(result).toBe('sent')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [to, subject, html] = sendEmail.mock.calls[0]
    expect(to).toBe('ops@example.test')
    expect(subject).toContain('ERP sync failed')
    expect(html).toContain('run-1')
    expect(html).toContain('16176')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('logs alert_skipped and does not send when SYNC_ALERT_EMAIL is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sendEmail = vi.fn()
    expect(await sendSyncFailureAlert(ALERT, { env: {} as unknown as NodeJS.ProcessEnv, sendEmail })).toBe('skipped')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain('erp_sync_alert_skipped')
  })

  it('never throws when the mailer fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP down'))
    await expect(sendSyncFailureAlert(ALERT, { env: { SYNC_ALERT_EMAIL: 'ops@example.test' } as unknown as NodeJS.ProcessEnv, sendEmail })).resolves.toBe('failed')
    expect(error.mock.calls[0][0]).toContain('erp_sync_alert_failed')
  })
})
