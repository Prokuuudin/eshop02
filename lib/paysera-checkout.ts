// Customer-facing Paysera switch, read per request (route handlers are not cached), so it can
// be flipped in the server env and the app recycled without a rebuild. Fails closed: anything
// but the exact string 'true' hides Paysera and rejects new payments. The webhook deliberately
// does not consult this flag, so payments already in flight still settle.
export function isPayseraCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PAYSERA_CHECKOUT_ENABLED?.trim() === 'true'
}
