import { withRetry } from './retry'

describe('withRetry', () => {
  it('returns result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and returns on eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, { baseDelayMs: 0 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after maxAttempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('always fail')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('applies exponential backoff between attempts', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok')
    const promise = withRetry(fn, { baseDelayMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise
    expect(result).toBe('ok')
    vi.useRealTimers()
  })
})
