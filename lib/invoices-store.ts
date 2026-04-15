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
  createInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'paidAmount' | 'remainingAmount' | 'paymentRecords'>) => string // Returns invoice ID
  getInvoice: (invoiceId: string) => Invoice | undefined
  getInvoicesByCompany: (companyId: string) => Invoice[]
  getInvoicesByOrder: (orderId: string) => Invoice | undefined
  updateInvoice: (invoiceId: string, updates: Partial<Invoice>) => void
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void
  
  // Payment management
  recordPayment: (invoiceId: string, payment: Omit<PaymentRecord, 'id' | 'date'>) => void
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
      
      createInvoice: (invoice) => {
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
      
      updateInvoice: (invoiceId, updates) => {
        set(state => {
          const invoice = state.invoices.get(invoiceId)
          if (!invoice) return state
          
          const newInvoices = new Map(state.invoices)
          newInvoices.set(invoiceId, { ...invoice, ...updates })
          return { invoices: newInvoices }
        })
      },
      
      updateInvoiceStatus: (invoiceId, status) => {
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
      
      recordPayment: (invoiceId, payment) => {
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
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        invoices: mergeInvoices(persistedState?.invoices),
        invoiceNumberCounter: persistedState.invoiceNumberCounter || 1000
      })
    }
  )
)
