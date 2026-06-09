export interface SyncError {
  batch: number
  message: string
  productIds?: string[]
}

export class SyncLogger {
  private errors: SyncError[] = []
  private count = 0

  info(message: string, data?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', message, ...data, ts: new Date().toISOString() }))
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: 'error', message, ...data, ts: new Date().toISOString() }))
  }

  recordBatchError(batch: number, err: unknown, productIds?: string[]): void {
    this.count++
    if (this.errors.length < 10) {
      this.errors.push({
        batch,
        message: err instanceof Error ? err.message : String(err),
        productIds,
      })
    }
  }

  getErrorCount(): number {
    return this.count
  }

  getErrorSample(): SyncError[] {
    return this.errors
  }
}
