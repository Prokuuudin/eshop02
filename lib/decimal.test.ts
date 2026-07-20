import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { toNum, toNumOrNull } from './decimal'

describe('toNum', () => {
  it('converts a Prisma.Decimal to a number', () => {
    expect(toNum(new Prisma.Decimal('19.99'))).toBe(19.99)
  })

  it('passes a plain number through unchanged', () => {
    expect(toNum(42)).toBe(42)
  })
})

describe('toNumOrNull', () => {
  it('returns null for null input', () => {
    expect(toNumOrNull(null)).toBeNull()
  })

  it('converts a Decimal', () => {
    expect(toNumOrNull(new Prisma.Decimal('5.50'))).toBe(5.5)
  })

  it('passes a plain number through', () => {
    expect(toNumOrNull(7)).toBe(7)
  })
})
