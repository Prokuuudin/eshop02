import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { Client } from 'pg'
import { resolveE2eDatabaseUrl } from '../scripts/e2e-database-guard'
import { E2E_CUSTOMER } from './helpers'

// Own customer per test: changing the e-mail must not disturb the shared fixtures.
const query = async <T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
  const client = new Client({ connectionString: resolveE2eDatabaseUrl(process.env) })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

const createCustomer = async (): Promise<{ id: string; email: string; card: string }> => {
  const suffix = randomBytes(4).toString('hex')
  const customer = { id: `u_e2e_email_${suffix}`, email: `e2e-email-${suffix}@example.test`, card: `E2E-EMAIL-${suffix.toUpperCase()}` }
  await query(
    `INSERT INTO "User" (id, email, "passwordHash", name, "platformRole", "cardNumber", "mustChangePassword", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'E2E Email', 'customer', $4, false, now(), now())`,
    [customer.id, customer.email, await bcrypt.hash(E2E_CUSTOMER.password, 4), customer.card],
  )
  return customer
}
const storedEmail = async (id: string): Promise<string> => (await query<{ email: string }>('SELECT email FROM "User" WHERE id = $1', [id]))[0].email

const planLink = async (customer: { id: string; email: string }, newEmail: string): Promise<string> => {
  const token = `${Buffer.from(customer.id).toString('base64url')}.${randomBytes(32).toString('hex')}`
  const value = {
    tokenHash: createHash('sha256').update(token).digest('hex'), newEmail, currentEmail: customer.email,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), language: 'ru',
  }
  await query(`INSERT INTO "KeyValueSetting" (key, value, "updatedAt") VALUES ($1, $2, now())`, [`email-change:${customer.id}`, JSON.stringify(value)])
  return token
}

const signIn = async (page: Page, card: string): Promise<void> => {
  const response = await page.request.post('/api/auth/login', { data: { identifier: card, password: E2E_CUSTOMER.password } })
  expect(response.ok()).toBeTruthy()
  const { user } = (await response.json()) as { user: unknown }
  await page.addInitScript((value) => {
    window.localStorage.setItem('eshop_current_user', JSON.stringify(value))
  }, user)
}

test.describe('confirmed e-mail change', () => {
  test('the profile cannot edit the address, and a request changes nothing until confirmed', async ({ page }) => {
    const customer = await createCustomer()
    await signIn(page, customer.card)
    await page.goto('/account/profile')

    const section = page.locator('.account-email')
    await section.getByRole('button').click()
    await section.locator('#email-change-new').fill(`next-${customer.id}@example.test`)
    await section.locator('#email-change-password').fill('definitely-wrong-password')
    await section.locator('button[type="submit"]').click()
    await expect(section.getByRole('alert')).toBeVisible()

    await section.locator('#email-change-password').fill(E2E_CUSTOMER.password)
    await section.locator('button[type="submit"]').click()
    await expect(page.getByTestId('email-change-sent')).toBeVisible()
    expect(await storedEmail(customer.id)).toBe(customer.email)
  })

  test('opening the link changes nothing; the button does, and only once', async ({ page }) => {
    const customer = await createCustomer()
    const newEmail = `confirmed-${customer.id}@example.test`
    const token = await planLink(customer, newEmail)
    const posts: string[] = []
    page.on('request', (request) => { if (request.url().includes('/api/user/email-change')) posts.push(request.method()) })

    const link = `/auth/confirm-email?token=${encodeURIComponent(token)}`
    await page.goto(link)
    const button = page.locator('main.confirm-email button')
    await expect(button).toBeVisible()
    expect(posts).toEqual([])
    expect(await storedEmail(customer.id)).toBe(customer.email)

    await button.click()
    await expect(page.getByTestId('confirm-email-success')).toBeVisible()
    expect(posts).toEqual(['POST'])
    expect(await storedEmail(customer.id)).toBe(newEmail)

    await page.goto(link)
    await page.locator('main.confirm-email button').click()
    await expect(page.getByTestId('confirm-email-invalid')).toBeVisible()
    expect(await storedEmail(customer.id)).toBe(newEmail)
  })

  test('a link without a token offers nothing to press', async ({ page }) => {
    await page.goto('/lv/auth/confirm-email')
    await expect(page.getByTestId('confirm-email-invalid')).toBeVisible()
    await expect(page.locator('main.confirm-email button')).toHaveCount(0)
  })
})
