export function assertSafeRestoreUrl(restoreUrl: string | undefined, productionUrl: string | undefined): string {
  if (!restoreUrl) throw new Error('RESTORE_DATABASE_URL is required; never point it at production')
  if (productionUrl && restoreUrl === productionUrl) {
    throw new Error('RESTORE_DATABASE_URL must not equal DATABASE_URL')
  }
  return restoreUrl
}
