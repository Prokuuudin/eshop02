async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('This scheduled entry point does not accept arguments')

  const [{ processAdminOrderNotificationOutbox }, { logOperationalEvent }, { prisma }] = await Promise.all([
    import('@/lib/order-admin-notification-worker'),
    import('@/lib/observability'),
    import('@/lib/prisma'),
  ])

  if (!process.env.CONTACT_TO?.trim()) {
    logOperationalEvent({
      event: 'order_admin_email_configuration_warning',
      level: 'warn',
      alert: true,
      reason: 'contact_to_missing',
      recipientConfigured: false,
    })
  }

  const totals = { claimed: 0, sent: 0, retryScheduled: 0, failed: 0, recovered: 0 }
  try {
    for (let batch = 0; batch < 10; batch += 1) {
      const result = await processAdminOrderNotificationOutbox({ batchSize: 20 })
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += result[key]
      if (result.claimed < 20) break
    }
    logOperationalEvent({ event: 'order_admin_email_outbox_run_completed', ...totals })
    process.exitCode = totals.retryScheduled > 0 || totals.failed > 0 ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  // Do not serialize arbitrary SMTP/database messages: they can contain credentials or PII.
  console.error(JSON.stringify({
    event: 'order_admin_email_outbox_run_failed',
    level: 'error',
    errorType: error instanceof Error ? error.name : 'UnknownError',
  }))
  process.exitCode = 1
})
