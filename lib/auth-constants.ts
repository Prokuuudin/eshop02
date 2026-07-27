export const SESSION_COOKIE = 'eshop_session'

// Onboarding password mailed to every cardholder (individual or company) —
// identical for all, its only job is to gate them into the forced
// "set your own password" screen. Single source of truth: every file that
// checks or emails this value must import it from here, not redefine it.
export const FIRST_LOGIN_PASSWORD =
  process.env.NEXT_PUBLIC_FIRST_LOGIN_PASSWORD || 'Welcome1!Change'
