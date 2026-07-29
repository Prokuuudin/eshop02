import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'

export interface PaymentRecord {
  id: string
  amount: number
  date: Date
  method: string // 'bank_transfer', 'card', 'cash', etc
  reference?: string // Transaction reference/ID
  recordedBy?: string // User ID who recorded this
}

export interface Invoice {
  id: string
  invoiceNumber: string // Human-readable like INV-2024-001
  companyId: string
  orderId: string
  
  // Amount details
  subtotal: number // Before tax
  taxRate: number // Percentage (e.g. 18)
  taxAmount: number
  total: number // subtotal + tax
  
  // Status and dates
  status: InvoiceStatus
  issuedDate: Date
  dueDate: Date
  paidDate?: Date
  
  // Payment tracking
  paymentRecords: PaymentRecord[]
  paidAmount: number // Sum of all payments
  remainingAmount: number // total - paidAmount
  
  // Additional info
  notes?: string
  items?: Array<{
    productId: string
    productTitle: string
    quantity: number
    unitPrice: number
    total: number
  }>
}

type InvoiceStore = {
  invoices: Map<string, Invoice>
  invoiceNumberCounter: number
  
  // Invoice CRUD
  createInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'paidAmount' | 'remainingAmount' | 'paymentRecords'>, opts?: { localOnly?: boolean }) => string // Returns invoice ID
  getInvoice: (invoiceId: string) => Invoice | undefined
  getInvoicesByCompany: (companyId: string) => Invoice[]
  getInvoicesByOrder: (orderId: string) => Invoice | undefined
  setInvoicesForCompany: (companyId: string, invoices: Invoice[]) => void
  updateInvoice: (invoiceId: string, updates: Partial<Invoice>) => void
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus, opts?: { localOnly?: boolean }) => void

  // Payment management
  recordPayment: (invoiceId: string, payment: Omit<PaymentRecord, 'id' | 'date'>, opts?: { localOnly?: boolean }) => void
  getPaymentRecords: (invoiceId: string) => PaymentRecord[]
  
  // Query helpers
  getOverdueInvoices: (companyId?: string) => Invoice[]
  getPendingInvoices: (companyId?: string) => Invoice[]
  getGeneratedInvoiceNumber: () => string
}

const toHydratedPaymentRecord = (record: PaymentRecord): PaymentRecord => ({
  ...record,
  date: record.date instanceof Date ? record.date : new Date(record.date)
})

const toHydratedInvoice = (invoice: Invoice): Invoice => ({
  ...invoice,
  issuedDate: invoice.issuedDate instanceof Date ? invoice.issuedDate : new Date(invoice.issuedDate),
  dueDate: invoice.dueDate instanceof Date ? invoice.dueDate : new Date(invoice.dueDate),
  paidDate: invoice.paidDate ? (invoice.paidDate instanceof Date ? invoice.paidDate : new Date(invoice.paidDate)) : undefined,
  paymentRecords: (invoice.paymentRecords ?? []).map(toHydratedPaymentRecord)
})

const mergeInvoices = (persistedInvoices: Array<[string, Invoice]> | undefined): Map<string, Invoice> => {
  return new Map((persistedInvoices ?? []).map(([invoiceId, invoice]) => [invoiceId, toHydratedInvoice(invoice)]))
}

export const useInvoicesStore = create<InvoiceStore>()(
  persist(
    (set, get) => ({
      invoices: new Map(),
      invoiceNumberCounter: 1000,
      
      createInvoice: (invoice, opts) => {
        const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const invoiceNumber = get().getGeneratedInvoiceNumber()

        const newInvoice: Invoice = {
          ...invoice,
          id: invoiceId,
          invoiceNumber,
          paymentRecords: [],
          paidAmount: 0,
          remainingAmount: invoice.total
        }

        set(state => {
          const newInvoices = new Map(state.invoices)
          newInvoices.set(invoiceId, newInvoice)
          return {
            invoices: newInvoices,
            invoiceNumberCounter: state.invoiceNumberCounter + 1
          }
        })

        if (!opts?.localOnly) {
          fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newInvoice),
          }).catch(() => {})
        }

        return invoiceId
      },
      
      getInvoice: (invoiceId) => {
        return get().invoices.get(invoiceId)
      },
      
      getInvoicesByCompany: (companyId) => {
        const invoices = Array.from(get().invoices.values())
        return invoices.filter(inv => inv.companyId === companyId)
      },
      
      getInvoicesByOrder: (orderId) => {
        const invoices = Array.from(get().invoices.values())
        return invoices.find(inv => inv.orderId === orderId)
      },

      setInvoicesForCompany: (companyId, invoices) => {
        set(state => {
          const newInvoices = new Map(state.invoices)
          for (const [id, inv] of newInvoices) {
            if (inv.companyId === companyId) newInvoices.delete(id)
          }
          for (const inv of invoices) {
            newInvoices.set(inv.id, toHydratedInvoice(inv))
          }
          return { invoices: newInvoices }
        })
      },

      updateInvoice: (invoiceId, updates) => {
        set(state => {
          const invoice = state.invoices.get(invoiceId)
          if (!invoice) return state
          
          const newInvoices = new Map(state.invoices)
          newInvoices.set(invoiceId, { ...invoice, ...updates })
          return { invoices: newInvoices }
        })
      },
      
      // opts is accepted for symmetry with the demo seeder; this action never
      // syncs to the server on its own.
      updateInvoiceStatus: (invoiceId, status, _opts) => {
        set(state => {
          const invoice = state.invoices.get(invoiceId)
          if (!invoice) return state
          
          const newInvoices = new Map(state.invoices)
          newInvoices.set(invoiceId, {
            ...invoice,
            status,
            paidDate: status === 'paid' ? new Date() : invoice.paidDate
          })
          return { invoices: newInvoices }
        })
      },
      
      recordPayment: (invoiceId, payment, opts) => {
        set(state => {
          const invoice = state.invoices.get(invoiceId)
          if (!invoice) return state

          const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const newPaymentRecord: PaymentRecord = {
            ...payment,
            id: paymentId,
            date: new Date()
          }

          const paidAmount = invoice.paidAmount + payment.amount
          const remainingAmount = invoice.total - paidAmount
          const newStatus: InvoiceStatus = remainingAmount <= 0 ? 'paid' : invoice.status

          const newInvoices = new Map(state.invoices)
          newInvoices.set(invoiceId, {
            ...invoice,
            paymentRecords: [...invoice.paymentRecords, newPaymentRecord],
            paidAmount,
            remainingAmount: Math.max(0, remainingAmount),
            status: newStatus,
            paidDate: newStatus === 'paid' ? new Date() : invoice.paidDate
          })
          return { invoices: newInvoices }
        })

        if (!opts?.localOnly) {
          fetch(`/api/invoices/${invoiceId}/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payment),
          }).catch(() => {})
        }
      },
      
      getPaymentRecords: (invoiceId) => {
        const invoice = get().invoices.get(invoiceId)
        return invoice?.paymentRecords || []
      },
      
      getOverdueInvoices: (companyId?) => {
        const now = new Date()
        const invoices = Array.from(get().invoices.values())
        
        return invoices.filter(inv => {
          const isOverdue = inv.status !== 'paid' && inv.status !== 'cancelled' && inv.dueDate < now
          return companyId ? isOverdue && inv.companyId === companyId : isOverdue
        })
      },
      
      getPendingInvoices: (companyId?) => {
        const invoices = Array.from(get().invoices.values())
        
        return invoices.filter(inv => {
          const isPending = inv.status === 'issued' && inv.remainingAmount > 0
          return companyId ? isPending && inv.companyId === companyId : isPending
        })
      },
      
      getGeneratedInvoiceNumber: () => {
        const year = new Date().getFullYear()
        const counter = get().invoiceNumberCounter
        return `INV-${year}-${String(counter).padStart(6, '0')}`
      }
    }),
    {
      name: 'invoices-store',
      partialize: (state) => ({
        invoices: Array.from(state.invoices.entries()),
        invoiceNumberCounter: state.invoiceNumberCounter
      }),
      merge: (persistedState: unknown, currentState) => {
        const persisted = persistedState as {
          invoices?: Array<[string, Invoice]>
          invoiceNumberCounter?: number
        }
        return {
          ...currentState,
          invoices: mergeInvoices(persisted.invoices),
          invoiceNumberCounter: persisted.invoiceNumberCounter || 1000
        }
      }
    }
  )
)

export async function hydrateInvoicesFromServer(companyId: string): Promise<void> {
  try {
    const res = await fetch(`/api/invoices?companyId=${encodeURIComponent(companyId)}`)
    if (!res.ok) return
    const data = (await res.json()) as { invoices?: Invoice[] }
    if (Array.isArray(data.invoices)) {
      useInvoicesStore.getState().setInvoicesForCompany(companyId, data.invoices)
    }
  } catch {
    // Keep whatever's already in the local store on failure.
  }
}
