'use client'

import type { User } from '@/lib/auth'
import { useCompanyStore } from '@/lib/company-store'
import { useInvoicesStore } from '@/lib/invoices-store'

const USERS_KEY = 'eshop_users'
const CURRENT_KEY = 'eshop_current_user'
const PREVIOUS_CURRENT_KEY = 'eshop_demo_previous_current_user'

const DEMO_COMPANY_ID = 'company_beauty_supply'
const DEMO_USER: User = {
  id: 'u_demo_b2b_manager',
  email: 'b2b-demo@eshop02.local',
  password: 'DemoPass123',
  name: 'B2B Demo Manager',
  platformRole: 'customer',
  companyId: DEMO_COMPANY_ID,
  companyName: 'Beauty Supply Pro',
  teamRole: 'manager',
  approvalRequired: true,
  auditLoggingEnabled: true
}

type DemoInvoiceSeed = {
  orderId: string
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  status: 'issued' | 'paid' | 'overdue'
  issuedDate: Date
  dueDate: Date
  notes: string
  items: Array<{
    productId: string
    productTitle: string
    quantity: number
    unitPrice: number
    total: number
  }>
  payment?: {
    amount: number
    method: string
    reference: string
  }
}

const DEMO_INVOICES: DemoInvoiceSeed[] = [
  {
    orderId: 'demo_b2b_order_001',
    subtotal: 24000,
    taxRate: 21,
    taxAmount: 5040,
    total: 29040,
    status: 'issued',
    issuedDate: new Date('2026-03-28T09:00:00.000Z'),
    dueDate: new Date('2026-04-27T09:00:00.000Z'),
    notes: 'Поставка профессиональной косметики для весеннего пополнения склада.',
    items: [
      { productId: 'p1', productTitle: 'Крем для лица Revitaluxe 50ml', quantity: 12, unitPrice: 1200, total: 14400 },
      { productId: 'p3', productTitle: 'Сыворотка омолаживающая 30ml', quantity: 4, unitPrice: 2400, total: 9600 }
    ]
  },
  {
    orderId: 'demo_b2b_order_002',
    subtotal: 16500,
    taxRate: 21,
    taxAmount: 3465,
    total: 19965,
    status: 'paid',
    issuedDate: new Date('2026-02-10T09:00:00.000Z'),
    dueDate: new Date('2026-03-12T09:00:00.000Z'),
    notes: 'Счёт закрыт в полном объёме банковским переводом.',
    items: [
      { productId: 'p8', productTitle: 'Профессиональный фен SalonDry 2200W', quantity: 3, unitPrice: 3500, total: 10500 },
      { productId: 'p6', productTitle: 'Аппарат для микродермабразии ProSkin', quantity: 2, unitPrice: 3000, total: 6000 }
    ],
    payment: {
      amount: 19965,
      method: 'bank_transfer',
      reference: 'BT-DEMO-2002'
    }
  },
  {
    orderId: 'demo_b2b_order_003',
    subtotal: 13200,
    taxRate: 21,
    taxAmount: 2772,
    total: 15972,
    status: 'overdue',
    issuedDate: new Date('2026-01-15T09:00:00.000Z'),
    dueDate: new Date('2026-02-14T09:00:00.000Z'),
    notes: 'Частично оплачен, остаток просрочен и требует внимания менеджера.',
    items: [
      { productId: 'p2', productTitle: 'Шампунь Professional Shine 300ml', quantity: 10, unitPrice: 900, total: 9000 },
      { productId: 'p5', productTitle: 'Крем для тела SilkTouch 200ml', quantity: 6, unitPrice: 700, total: 4200 }
    ],
    payment: {
      amount: 6000,
      method: 'bank_transfer',
      reference: 'BT-DEMO-2003'
    }
  }
]

const readUsers = (): User[] => {
  try {
    const raw = window.localStorage.getItem(USERS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as User[]
  } catch {
    return []
  }
}

const writeUsers = (users: User[]): void => {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

const readCurrentUser = (): User | null => {
  try {
    const raw = window.localStorage.getItem(CURRENT_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

const storePreviousCurrentUser = (user: User | null): void => {
  if (!user) {
    window.localStorage.removeItem(PREVIOUS_CURRENT_KEY)
    return
  }

  window.localStorage.setItem(PREVIOUS_CURRENT_KEY, JSON.stringify(user))
}

const readPreviousCurrentUser = (): User | null => {
  try {
    const raw = window.localStorage.getItem(PREVIOUS_CURRENT_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export const isDemoB2BUser = (user: User | null | undefined): boolean => user?.id === DEMO_USER.id

export const seedDemoB2BData = (): User => {
  const companyStore = useCompanyStore.getState()
  const invoicesStore = useInvoicesStore.getState()
  const currentUser = readCurrentUser()

  if (!isDemoB2BUser(currentUser)) {
    storePreviousCurrentUser(currentUser)
  }

  companyStore.upsertCompany({
    companyId: DEMO_COMPANY_ID,
    companyName: 'Beauty Supply Pro',
    taxId: 'LV50004567891',
    registrationNumber: '50004567891',
    city: 'Daugavpils',
    country: 'Latvia',
    paymentTermDays: 60,
    creditLimit: 90000,
    approvalWorkflowEnabled: true
  })

  if (!companyStore.getTeamMember(DEMO_COMPANY_ID, DEMO_USER.id)) {
    companyStore.addTeamMember(DEMO_COMPANY_ID, {
      userId: DEMO_USER.id,
      email: DEMO_USER.email,
      role: 'manager',
      name: DEMO_USER.name || DEMO_USER.email,
      addedAt: new Date('2026-01-10T09:00:00.000Z'),
      addedBy: DEMO_USER.id
    })
  }

  const users = readUsers()
  const nextUsers = users.some((user) => user.id === DEMO_USER.id || user.email === DEMO_USER.email)
    ? users.map((user) => (user.id === DEMO_USER.id || user.email === DEMO_USER.email ? DEMO_USER : user))
    : [...users, DEMO_USER]

  writeUsers(nextUsers)
  window.localStorage.setItem(CURRENT_KEY, JSON.stringify(DEMO_USER))
  companyStore.setCurrentCompany(DEMO_COMPANY_ID)

  for (const invoiceSeed of DEMO_INVOICES) {
    const existingInvoice = invoicesStore.getInvoicesByOrder(invoiceSeed.orderId)
    if (existingInvoice) continue

    const invoiceId = invoicesStore.createInvoice({
      companyId: DEMO_COMPANY_ID,
      orderId: invoiceSeed.orderId,
      subtotal: invoiceSeed.subtotal,
      taxRate: invoiceSeed.taxRate,
      taxAmount: invoiceSeed.taxAmount,
      total: invoiceSeed.total,
      status: invoiceSeed.payment ? 'issued' : invoiceSeed.status,
      issuedDate: invoiceSeed.issuedDate,
      dueDate: invoiceSeed.dueDate,
      notes: invoiceSeed.notes,
      items: invoiceSeed.items
    })

    if (invoiceSeed.payment) {
      invoicesStore.recordPayment(invoiceId, {
        amount: invoiceSeed.payment.amount,
        method: invoiceSeed.payment.method,
        reference: invoiceSeed.payment.reference,
        recordedBy: DEMO_USER.id
      })
    }

    if (invoiceSeed.status === 'overdue') {
      invoicesStore.updateInvoiceStatus(invoiceId, 'overdue')
    }
  }

  const currentInvoices = invoicesStore.getInvoicesByCompany(DEMO_COMPANY_ID)
  const usedCredit = currentInvoices
    .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled')
    .reduce((sum, invoice) => sum + invoice.remainingAmount, 0)

  companyStore.updateCompany(DEMO_COMPANY_ID, {
    usedCredit,
    creditLimit: 90000
  })

  window.dispatchEvent(new CustomEvent('eshop-user-changed'))

  return DEMO_USER
}

export const resetDemoB2BSession = (): User | null => {
  const companyStore = useCompanyStore.getState()
  const previousUser = readPreviousCurrentUser()
  const users = readUsers().filter((user) => user.id !== DEMO_USER.id)

  writeUsers(users)

  if (previousUser) {
    window.localStorage.setItem(CURRENT_KEY, JSON.stringify(previousUser))
    if (previousUser.companyId) {
      companyStore.setCurrentCompany(previousUser.companyId)
    } else {
      useCompanyStore.setState({ currentCompanyId: undefined })
    }
  } else {
    window.localStorage.removeItem(CURRENT_KEY)
    useCompanyStore.setState({ currentCompanyId: undefined })
  }

  window.localStorage.removeItem(PREVIOUS_CURRENT_KEY)
  window.dispatchEvent(new CustomEvent('eshop-user-changed'))

  return previousUser
}