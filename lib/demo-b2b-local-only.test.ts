import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCompanyStore } from './company-store'
import { useInvoicesStore } from './invoices-store'

// Демо-режим B2B должен жить строго в браузере: общая Neon-БД — копия живого
// магазина, и фейковая компания «Beauty Supply Pro» с инвойсами на удалённые
// товары не должна туда попадать ни при каких кликах по «Загрузить демо».

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
})

describe('company store localOnly', () => {
  it('upsertCompany with localOnly does not touch the network', () => {
    vi.stubGlobal('window', {})
    useCompanyStore.getState().upsertCompany(
      {
        companyId: 'demo_test_co',
        companyName: 'Demo Test Co',
        paymentTermDays: 60,
        approvalWorkflowEnabled: true,
      },
      { localOnly: true }
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(useCompanyStore.getState().getCompany('demo_test_co')?.companyName).toBe('Demo Test Co')
  })

  it('updateCompany with localOnly does not touch the network', () => {
    useCompanyStore.getState().updateCompany('demo_test_co', { creditLimit: 1 }, { localOnly: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('addTeamMember with localOnly does not touch the network', () => {
    useCompanyStore.getState().addTeamMember(
      'demo_test_co',
      {
        userId: 'u_demo_test',
        email: 'demo@test.local',
        role: 'manager',
        name: 'Demo',
        addedAt: new Date(),
        addedBy: 'u_demo_test',
      },
      { localOnly: true }
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('upsertCompany without the flag still syncs to the server', () => {
    vi.stubGlobal('window', {})
    useCompanyStore.getState().upsertCompany({
      companyId: 'real_co',
      companyName: 'Real Co',
      paymentTermDays: 60,
      approvalWorkflowEnabled: true,
    })
    expect(fetch).toHaveBeenCalled()
  })
})

describe('invoices store localOnly', () => {
  it('createInvoice/recordPayment/updateInvoiceStatus with localOnly do not touch the network', () => {
    const store = useInvoicesStore.getState()
    const id = store.createInvoice(
      {
        companyId: 'demo_test_co',
        orderId: 'demo_test_order',
        subtotal: 100,
        taxRate: 21,
        taxAmount: 21,
        total: 121,
        status: 'issued',
        issuedDate: new Date(),
        dueDate: new Date(),
        items: [],
      },
      { localOnly: true }
    )
    useInvoicesStore.getState().recordPayment(id, { amount: 50, method: 'bank_transfer', reference: 'x', recordedBy: 'u' }, { localOnly: true })
    useInvoicesStore.getState().updateInvoiceStatus(id, 'overdue', { localOnly: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('createInvoice without the flag still syncs to the server', () => {
    useInvoicesStore.getState().createInvoice({
      companyId: 'real_co',
      orderId: 'real_order',
      subtotal: 1,
      taxRate: 21,
      taxAmount: 0.21,
      total: 1.21,
      status: 'issued',
      issuedDate: new Date(),
      dueDate: new Date(),
      items: [],
    })
    expect(fetch).toHaveBeenCalled()
  })
})
