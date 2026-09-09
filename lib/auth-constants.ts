export const SESSION_COOKIE = 'eshop_session'

// Onboarding password mailed to a new B2B team member claiming a shared
// company card (register-card's company branch only) — its only job is to
// gate them into the forced "set your own password" screen. Individual
// cardholders activate via phone-last-4/email verification instead and never
// touch this constant. Single source of truth: every file that checks or
// emails this value must import it from here, not redefine it.
//
// Server-only on purpose: this must NEVER be read via a NEXT_PUBLIC_ var or
// imported into any 'use client' component, or Next.js inlines it into the
// public JS bundle — anyone loading the site could read it straight out of
// devtools, with no need to ever have received the email. Real security here
// rests entirely on the password only reaching people through that email.
export const FIRST_LOGIN_PASSWORD =
  process.env.FIRST_LOGIN_PASSWORD
  || (process.env.NODE_ENV === 'production' ? '' : 'Welcome1!Change')
