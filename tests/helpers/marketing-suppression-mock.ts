import { vi } from 'vitest'

/**
 * Module factory for `vi.mock('@/lib/marketing-suppression', ...)` in route tests that are not
 * about the suppression list: nobody is suppressed and sendMarketingEmail forwards to the
 * (mocked) sendEmail with the same arguments as before, so existing assertions keep working.
 * The real behaviour is covered by lib/marketing-suppression.test.ts and the opt-out tests.
 */
export async function marketingSuppressionPassthrough(): Promise<Record<string, unknown>> {
  const mailer = await import('@/lib/mailer')
  return {
    MARKETING_SUPPRESSION_PREFIX: 'marketing:optout:',
    suppressedUserIds: vi.fn(async () => [] as string[]),
    getMarketingSuppressions: vi.fn(async () => new Map()),
    isMarketingSuppressed: vi.fn(async () => false),
    carryMarketingSuppression: vi.fn(async () => false),
    sendMarketingEmail: vi.fn(async (to: string, subject: string, html: string, _meta: unknown, options?: unknown) => {
      if (options === undefined) await mailer.sendEmail(to, subject, html)
      else await mailer.sendEmail(to, subject, html, options as Parameters<typeof mailer.sendEmail>[3])
      return 'sent' as const
    }),
  }
}
