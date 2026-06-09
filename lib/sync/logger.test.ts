import { SyncLogger } from './logger'

describe('SyncLogger', () => {
  it('errorSample is capped at 10 entries', () => {
    const logger = new SyncLogger()
    for (let i = 0; i < 15; i++) {
      logger.recordBatchError(i, new Error(`err ${i}`))
    }
    expect(logger.getErrorSample()).toHaveLength(10)
  })

  it('errorCount reflects all errors including those beyond cap', () => {
    const logger = new SyncLogger()
    for (let i = 0; i < 15; i++) {
      logger.recordBatchError(i, new Error(`err ${i}`))
    }
    expect(logger.getErrorCount()).toBe(15)
  })

  it('errorSample entry includes batch index, message, and productIds', () => {
    const logger = new SyncLogger()
    logger.recordBatchError(3, new Error('db timeout'), ['ext-1', 'ext-2'])
    expect(logger.getErrorSample()[0]).toMatchObject({
      batch: 3,
      message: 'db timeout',
      productIds: ['ext-1', 'ext-2'],
    })
  })
})
