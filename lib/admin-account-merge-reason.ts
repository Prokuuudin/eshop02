/**
 * Why an admin merged two accounts: a fixed code plus an optional short note. The code is what
 * the audit log is meant to carry; the note is for the rare case the codes do not cover.
 *
 * The note check only catches obvious mistakes (an email address, a long number such as a phone,
 * card, IBAN or code, a password or token mention). It cannot recognise every secret or every
 * piece of personal data in free text, so the dialog asks for no personal data at all.
 */
export const MERGE_REASON_CODES = ['phone_match', 'customer_confirmed', 'order_history_match', 'other'] as const
export type MergeReasonCode = (typeof MERGE_REASON_CODES)[number]

export const MERGE_NOTE_MAX_LENGTH = 200

export type MergeNoteProblem = 'too_long' | 'required' | 'personal_data'

const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /\S+@\S+/u, // email address
  /\d[\d\s-]{5,}\d/u, // 7+ digits in a row (phone, card, IBAN part, personal code)
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4,}/u, // IBAN-like
  /(password|parole|парол|token|токен|secret|секрет|pin\b|пин\b)/iu,
]

/** Normalised note, or the reason it is refused. */
export function checkMergeNote(code: MergeReasonCode, raw: string | null | undefined): { note: string | null } | { problem: MergeNoteProblem } {
  // Control characters and line breaks never go into the audit row.
  const note = (raw ?? '').replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (note.length > MERGE_NOTE_MAX_LENGTH) return { problem: 'too_long' }
  if (code === 'other' && note.length < 5) return { problem: 'required' }
  if (note && PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(note))) return { problem: 'personal_data' }
  return { note: note || null }
}

/** The audit `reason` text: the code, then the note if any. */
export const mergeAuditReason = (code: MergeReasonCode, note: string | null): string => (note ? `${code}: ${note}` : code)
