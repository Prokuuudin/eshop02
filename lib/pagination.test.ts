import { describe, expect, it } from 'vitest'
import { parseOffsetPagination } from './pagination'

describe('parseOffsetPagination', () => {
  it('uses defaults and clamps unsafe values', () => {
    expect(parseOffsetPagination(new URLSearchParams())).toEqual({ skip: 0, take: 100 })
    expect(parseOffsetPagination(new URLSearchParams('skip=-5&take=999'))).toEqual({ skip: 0, take: 200 })
  })

  it('supports endpoint-specific limits and invalid input', () => {
    const options = { defaultTake: 50, maxTake: 100 }
    expect(parseOffsetPagination(new URLSearchParams('skip=nope&take=nope'), options)).toEqual({ skip: 0, take: 50 })
    expect(parseOffsetPagination(new URLSearchParams('skip=25&take=0'), options)).toEqual({ skip: 25, take: 1 })
  })
})
