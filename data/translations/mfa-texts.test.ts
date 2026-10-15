import { describe, expect, it } from 'vitest'
import ruAccount from './ru/account'
import lvAccount from './lv/account'
import enAccount from './en/account'

// Staff-facing MFA texts on the sign-in screen (components/auth/LoginForm.tsx).
const MFA_KEYS = [
  'auth.mfaCode',
  'auth.mfaCodeHint',
  'auth.mfaUseRecovery',
  'auth.mfaUseApp',
  'auth.mfaRecoveryLabel',
  'auth.mfaRecoveryHint',
  'auth.mfaRecoveryInvalid',
  'auth.mfaInvalidCode',
  'auth.mfaExpired',
  'auth.mfaRateLimited',
  'auth.mfaSetupTitle',
  'auth.mfaSetupIntro',
  'auth.mfaSetupHowTitle',
  'auth.mfaSetupStep1',
  'auth.mfaSetupStep2',
  'auth.mfaSetupStep3',
  'auth.mfaSetupStep4',
  'auth.mfaSetupSaveCodes',
  'auth.mfaRecoveryTitle',
  'auth.mfaRecoveryIntro',
  'auth.mfaRecoveryDone',
] as const

const dictionaries = { ru: ruAccount, lv: lvAccount, en: enAccount }
const JARGON = /\b(totp|aes|token|hash|bcrypt|secret|otp)\b|токен|хэш|хеш/i
const CYRILLIC = /[Ѐ-ӿ]/

describe('MFA sign-in texts (RU / LV / EN)', () => {
  it.each(Object.entries(dictionaries))('%s has every MFA key with a non-empty text', (_lang, dict) => {
    for (const key of MFA_KEYS) expect(dict[key]?.trim(), key).toBeTruthy()
  })

  it.each(Object.entries(dictionaries))('%s uses plain language (no technical jargon)', (_lang, dict) => {
    for (const key of MFA_KEYS) expect(dict[key], key).not.toMatch(JARGON)
  })

  it('Russian texts are Russian and Latvian/English texts contain no Cyrillic', () => {
    for (const key of MFA_KEYS) {
      expect(ruAccount[key], key).toMatch(CYRILLIC)
      expect(lvAccount[key], key).not.toMatch(CYRILLIC)
      expect(enAccount[key], key).not.toMatch(CYRILLIC)
    }
  })

  it('the backup-code switch is named the same way in the hint texts that refer to it', () => {
    expect(ruAccount['auth.mfaRecoveryIntro']).toContain(ruAccount['auth.mfaUseRecovery'])
    expect(lvAccount['auth.mfaRecoveryIntro']).toContain(lvAccount['auth.mfaUseRecovery'])
    expect(enAccount['auth.mfaRecoveryIntro']).toContain(enAccount['auth.mfaUseRecovery'])
    expect(ruAccount['auth.mfaSetupSaveCodes']).toContain(ruAccount['auth.mfaRecoveryDone'])
    expect(lvAccount['auth.mfaSetupSaveCodes']).toContain(lvAccount['auth.mfaRecoveryDone'])
    expect(enAccount['auth.mfaSetupSaveCodes']).toContain(enAccount['auth.mfaRecoveryDone'])
  })
})
