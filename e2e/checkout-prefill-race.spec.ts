import { expect, test, type Page } from '@playwright/test'
import { E2E_CUSTOMER, fetchRealProduct, loginAs } from './helpers'

// The checkout prefills empty fields from the profile, saved addresses and the last order once
// /api/orders/my answers. That answer can arrive after the customer has already focused a field;
// the late value must not land under the cursor and merge with the typing.

async function openCheckoutWithHeldPrefill(page: Page): Promise<() => void> {
  await loginAs(page, E2E_CUSTOMER)
  const product = await fetchRealProduct(page)
  await page.addInitScript(({ item, user }) => {
    window.localStorage.setItem('eshop_current_user', JSON.stringify(user))
    window.localStorage.setItem('cart-store', JSON.stringify({ state: { items: [item] }, version: 0 }))
  }, {
    item: { ...product, quantity: 1, lineKey: product.id },
    user: { id: E2E_CUSTOMER.id, email: E2E_CUSTOMER.email, name: E2E_CUSTOMER.name, platformRole: 'customer' },
  })
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/orders/my', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/checkout')
  await expect(page.locator('#checkout-email')).toBeVisible()
  return release
}

test.describe('checkout profile prefill', () => {
  test('a late prefill does not change an email field the customer has focused', async ({ page }) => {
    const release = await openCheckoutWithHeldPrefill(page)
    const email = page.locator('#checkout-email')
    const firstName = page.locator('input[name="firstName"]')

    await email.click()
    release()
    // The untouched first name proves the prefill has arrived.
    await expect(firstName).toHaveValue('E2E')
    await expect(email).toHaveValue('')

    await email.pressSequentially('ivan.petrov@example.com')
    await expect(email).toHaveValue('ivan.petrov@example.com')
  })

  test('a late prefill does not change an email the customer has typed and left', async ({ page }) => {
    const release = await openCheckoutWithHeldPrefill(page)
    const email = page.locator('#checkout-email')
    const firstName = page.locator('input[name="firstName"]')

    await email.fill('ivan.petrov@example.com')
    await firstName.focus()
    await email.fill('')
    await firstName.focus()
    release()
    await expect(page.locator('input[name="lastName"]')).toHaveValue('Customer')
    // The customer cleared the field on purpose: the profile email must not come back.
    await expect(email).toHaveValue('')
  })

  test('an untouched empty email is still prefilled from the profile', async ({ page }) => {
    const release = await openCheckoutWithHeldPrefill(page)
    release()
    await expect(page.locator('#checkout-email')).toHaveValue(E2E_CUSTOMER.email)
    await expect(page.locator('input[name="firstName"]')).toHaveValue('E2E')
  })
})
