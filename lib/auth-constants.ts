export const SESSION_COOKIE = 'eshop_session'

// Onboarding password mailed to every cardholder (individual or company) —
// identical for all, its only job is to gate them into the forced
// "set your own password" screen. Single source of truth: every file that
// checks or emails this value must import it from here, not redefine it.
//
// Server-only on purpose: this must NEVER be read via a NEXT_PUBLIC_ var or
// imported into any 'use client' component, or Next.js inlines it into the
// public JS bundle — anyone loading the site could read it straight out of
// devtools, with no need to ever have received the email. Real security here
// rests entirely on the password only reaching people through that email.
export const FIRST_LOGIN_PASSWORD =
  process.env.FIRST_LOGIN_PASSWORD || 'Welcome1!Change'
