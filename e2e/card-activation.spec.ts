import { expect, test } from '@playwright/test'
import { E2E_CUSTOMER, E2E_DORMANT_CUSTOMER } from './helpers'

test.describe('card activation instead of password login', () => {
  test('a not-activated customer gets no session and is sent to activation', async ({ page, context }) => {
    await page.goto('/auth/login')
    await page.locator('#login-identifier').fill(E2E_DORMANT_CUSTOMER.cardNumber as string)
    await page.locator('form:has(#login-identifier) input[type="password"]').fill(E2E_DORMANT_CUSTOMER.password)
    await page.locator('form:has(#login-identifier) button[type="submit"]').click()

    const notice = page.getByTestId('login-activation-required')
    await expect(notice).toBeVisible()
    expect((await context.cookies()).some((cookie) => cookie.name === 'eshop_session')).toBe(false)

    await notice.getByRole('link').click()
    await expect(page).toHaveURL(/\/auth\/register/)
    await expect(page.locator('.register-form__intro')).toBeVisible()
  })

  test('a wrong password shows no activation hint', async ({ page }) => {
    await page.goto('/auth/login')
    await page.locator('#login-identifier').fill(E2E_DORMANT_CUSTOMER.cardNumber as string)
    await page.locator('form:has(#login-identifier) input[type="password"]').fill('definitely-wrong-password')
    await page.locator('form:has(#login-identifier) button[type="submit"]').click()

    await expect(page.locator('form:has(#login-identifier) p.text-red-600')).toBeVisible()
    await expect(page.getByTestId('login-activation-required')).toHaveCount(0)
  })

  test('an active customer still signs in with a session', async ({ page, context }) => {
    await page.goto('/auth/login')
    await page.locator('#login-identifier').fill(E2E_CUSTOMER.cardNumber as string)
    await page.locator('form:has(#login-identifier) input[type="password"]').fill(E2E_CUSTOMER.password)
    await page.locator('form:has(#login-identifier) button[type="submit"]').click()

    await expect(page).toHaveURL(/\/account/)
    expect((await context.cookies()).some((cookie) => cookie.name === 'eshop_session')).toBe(true)
  })
})
