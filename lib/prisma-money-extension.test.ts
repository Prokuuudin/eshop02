import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { convertMoneyFields } from './prisma-money-extension'

describe('convertMoneyFields', () => {
  it('converts known money fields from Decimal to number', () => {
    const row = { id: '1', total: new Prisma.Decimal('99.90'), email: 'a@b.c' }
    const result = convertMoneyFields('Order', row) as typeof row
    expect(result.total).toBe(99.9)
    expect(typeof result.total).toBe('number')
  })

  it('leaves non-money fields untouched', () => {
    const row = { id: '1', total: new Prisma.Decimal('10'), email: 'a@b.c' }
    const result = convertMoneyFields('Order', row) as { email: string }
    expect(result.email).toBe('a@b.c')
  })

  it('passes through models with no configured money fields unchanged', () => {
    const row = { id: '1', foo: 'bar' }
    expect(convertMoneyFields('SomeUnknownModel', row)).toBe(row)
  })

  it('handles arrays of rows (findMany results)', () => {
    const rows = [
      { id: '1', price: new Prisma.Decimal('5') },
      { id: '2', price: new Prisma.Decimal('7.25') },
    ]
    const result = convertMoneyFields('Product', rows) as Array<{ price: number }>
    expect(result.map((r) => r.price)).toEqual([5, 7.25])
  })

  it('passes through null and primitive results unchanged (count, aggregate, etc.)', () => {
    expect(convertMoneyFields('Order', null)).toBeNull()
    expect(convertMoneyFields('Order', 5)).toBe(5)
  })
})
