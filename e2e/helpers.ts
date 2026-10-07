import { expect, type Page } from '@playwright/test'
import { generate } from 'otplib'

export type E2eUserFixture = {
  id: string
  email: string
  password: string
  name: string
  platformRole: 'customer' | 'admin'
  teamRole?: 'viewer' | 'buyer' | 'manager' | 'admin'
  companyId?: string
  companyName?: string
  approvalRequired?: boolean
  auditLoggingEnabled?: boolean
  /** Login identifier for non-admin accounts (customers and staff managers log in by card). */
  cardNumber?: string
}

/**
 * Test-only TOTP secret (base32), enrolled for the admin/manager fixtures by
 * e2e/global-setup.ts. Admin access always requires MFA, so these fixtures sign
 * in exactly like real staff: password, then a TOTP code.
 */
export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

export const requiresMfa = (fixture: E2eUserFixture): boolean =>
  fixture.platformRole === 'admin' || fixture.teamRole === 'manager'

// Фикстуры существуют в БД (см. e2e/global-setup.ts). Клиенты получают
// сессионную куку через /api/auth/sync, админ и менеджер — через login + TOTP.
export const E2E_MANAGER: E2eUserFixture = {
  id: 'u_e2e_manager_fixture',
  email: 'e2e-manager@hairshoppro.lv.local',
  password: 'StrongPass123',
  name: 'E2E Manager',
  platformRole: 'customer',
  teamRole: 'manager',
  companyId: 'company_miks_plus',
  companyName: 'SIA MIKS PLUS',
  approvalRequired: false,
  auditLoggingEnabled: true,
  cardNumber: 'E2E-MANAGER-FIXTURE'
}

export const E2E_ADMIN: E2eUserFixture = {
  id: 'u_e2e_admin_fixture',
  email: 'e2e-admin@hairshoppro.lv.local',
  password: 'StrongPass123',
  name: 'E2E Admin',
  platformRole: 'admin',
  auditLoggingEnabled: true
}

export const E2E_CUSTOMER: E2eUserFixture = {
  id: 'u_e2e_customer_fixture',
  email: 'e2e-customer@hairshoppro.lv.local',
  password: 'StrongPass123',
  name: 'E2E Customer',
  platformRole: 'customer'
}

/** Настоящая серверная сессия: кука eshop_session сохраняется в контексте. */
export const loginAs = async (page: Page, fixture: E2eUserFixture): Promise<void> => {
  if (requiresMfa(fixture)) {
    const identifier = fixture.platformRole === 'admin' ? fixture.email : fixture.cardNumber
    const login = await page.request.post('/api/auth/login', { data: { identifier, password: fixture.password } })
    expect(login.ok(), `auth/login failed for ${fixture.email}: ${login.status()}`).toBeTruthy()
    const { challengeToken, enrollmentRequired } = (await login.json()) as { challengeToken?: string; enrollmentRequired?: boolean }
    expect(challengeToken && !enrollmentRequired, 'fixture must be MFA-enrolled by global-setup').toBeTruthy()
    const verify = await page.request.post('/api/auth/mfa/verify', {
      data: { challengeToken, code: await generate({ secret: E2E_TOTP_SECRET }) },
    })
    expect(verify.ok(), `auth/mfa/verify failed for ${fixture.email}: ${verify.status()}`).toBeTruthy()
    return
  }
  const response = await page.request.post('/api/auth/sync', {
    data: { id: fixture.id, email: fixture.email, password: fixture.password }
  })
  expect(response.ok(), `auth/sync failed for ${fixture.email}: ${response.status()}`).toBeTruthy()
}

/** Живой товар из Neon — демо-товары (p1-p16) удалены из БД. */
export const fetchRealProduct = async (
  page: Page,
  category = 'hair'
): Promise<Record<string, unknown> & { id: string; title: string }> => {
  const response = await page.request.get(`/api/products?category=${category}&skip=0&take=50`)
  const payload = (await response.json()) as { data?: { products?: Array<Record<string, unknown>> } }
  const products = payload.data?.products ?? []
  const product = products.find((p) => (p.stock as number) > 0 && (p.price as number) >= 20) ?? products[0]
  if (!product) throw new Error('fetchRealProduct: no products returned by /api/products')
  return product as Record<string, unknown> & { id: string; title: string }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Регэксп по тайтлу, устойчивый к нормализации пробелов в DOM. */
export const titlePattern = (title: string): RegExp =>
  new RegExp(title.trim().split(/\s+/).map(escapeRegExp).join('\\s+'), 'i')
