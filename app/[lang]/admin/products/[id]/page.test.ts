import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  getAdminProductById: vi.fn(),
  getDuplicateProductMetadataFlags: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/product-overrides-store', () => ({
  getAdminProductById: mocks.getAdminProductById,
  getDuplicateProductMetadataFlags: mocks.getDuplicateProductMetadataFlags,
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`) },
}))
// The client editor is irrelevant here; the test inspects the props the server page passes to it.
vi.mock('./ProductEditPageContent', () => ({ default: () => null }))

import ProductEditPage from './page'

const product = {
  id: '22272', title: 'Matrix Light Master', brand: 'MATRIX', category: 'hair', rating: 0,
  price: 31.5, stock: 2, sku: '7024604', barcode: '3474637024604', revision: 19,
  erpPriceMissing: true, manualPriceApproved: false,
}

const renderPage = () => ProductEditPage({
  params: Promise.resolve({ id: '22272' }),
  searchParams: Promise.resolve({}),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAdminProductById.mockResolvedValue(product)
})

describe('admin product edit page authorization', () => {
  it.each([
    ['an anonymous visitor', null],
    ['a B2B customer', { id: 'u1', platformRole: 'customer', teamRole: 'admin' }],
    ['a manager without catalog access', { id: 'u2', platformRole: 'customer', teamRole: 'manager' }],
  ])('never loads product data for %s', async (_label, user) => {
    mocks.getServerUser.mockResolvedValue(user)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.getAdminProductById).not.toHaveBeenCalled()
    expect(mocks.getDuplicateProductMetadataFlags).not.toHaveBeenCalled()
  })

  it('loads the editor data for an administrator', async () => {
    mocks.getServerUser.mockResolvedValue({ id: 'a1', platformRole: 'admin', teamRole: null })

    const element = await renderPage() as React.ReactElement<{ initialValues: Record<string, unknown> }>

    expect(mocks.getAdminProductById).toHaveBeenCalledWith('22272')
    expect(element.props).toMatchObject({
      productId: '22272',
      revision: 19,
      erpPriceStatus: { price: 31.5, erpPriceMissing: true, manualPriceApproved: false },
    })
    expect(element.props.initialValues).toMatchObject({ price: 31.5, stock: 2, sku: '7024604', barcode: '3474637024604' })
  })
})
