export interface SyncError {
  batch: number
  message: string
  productIds?: string[]
}

export class SyncLogger {
  private errors: SyncError[] = []
  private count = 0

  info(message: string, data?: Record<string, unknown>): void {
    logOperationalEvent({ event: 'erp_sync_event', message, ...data })
  }

  error(message: string, data?: Record<string, unknown>): void {
    logOperationalEvent({ event: 'erp_sync_failed', level: 'error', alert: true, message, ...data })
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
import { logOperationalEvent } from '@/lib/observability'
