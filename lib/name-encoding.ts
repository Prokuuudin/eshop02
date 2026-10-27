/**
 * Detects client names damaged by the GrinS → xlsx export (BUG-001): text
 * stored in Windows-1257 (Baltic) was read back as Windows-1251 (Cyrillic),
 * so every Latvian letter became one Cyrillic letter with the same byte
 * value — "Bērziņa" → "Bзrziтa", "Jeļena" → "Jeпena".
 *
 * The damage is byte-for-byte reversible (cp1251 char → byte → cp1257 char),
 * but only some names can be repaired automatically:
 *  - names without Latin letters, or whose Cyrillic words are whole words
 *    ("Ivan Петров"), are genuine Cyrillic and are never touched;
 *  - "П" decodes to "Ļ" in cp1257 but to "Ž" in the older DOS cp775 that a
 *    few GrinS records use, so names containing it need a human;
 *  - non-Latvian Baltic letters (Ü, Ä, Ń…), mid-word capitals and bytes that
 *    do not decode to a letter usually mean cp775 or something else entirely.
 *
 * Assumes the input comes from the GrinS export, where Cyrillic cannot be
 * typed at all. Do not apply to free-text names entered on the website: a
 * Cyrillic look-alike such as "Мarina" would be "repaired" to "Ģarina".
 */

const CYRILLIC = /[Ѐ-ӿ]/
const CYRILLIC_ONLY_WORD = /^[Ѐ-ӿ]+$/
const LATIN = /[A-Za-z]/
const LATVIAN_LETTERS = 'āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ'
const LATVIAN_UPPER = 'ĀČĒĢĪĶĻŅŠŪŽ'
// "П" (0xCF): Ļ in cp1257, Ž in cp775 — both plausible in Latvian names.
const AMBIGUOUS = 'П'

const decodeHighBytes = (encoding: string) =>
  [...new TextDecoder(encoding).decode(Uint8Array.from({ length: 128 }, (_, i) => i + 128))]

/** Cyrillic char → the cp1257 char that has the same byte value. */
const CP1251_TO_CP1257 = (() => {
  const cp1251 = decodeHighBytes('windows-1251')
  const cp1257 = decodeHighBytes('windows-1257')
  const map = new Map<string, string>()
  cp1251.forEach((ch, i) => {
    if (CYRILLIC.test(ch)) map.set(ch, cp1257[i])
  })
  return map
})()

export type NameEncodingVerdict =
  | { kind: 'clean' }
  | { kind: 'cyrillic' }
  | { kind: 'repairable'; repaired: string }
  | { kind: 'suspicious'; reason: NameEncodingIssue; proposed: string | null }

export type NameEncodingIssue =
  | 'ambiguous-ļ-or-ž'
  | 'non-latvian-letter'
  | 'mid-word-capital'
  | 'mixed-cyrillic-words'
  | 'undecodable'

/** Re-reads each Cyrillic char as cp1257; other chars are kept. */
export function reinterpretCp1251AsCp1257(value: string): string {
  return [...value].map((ch) => CP1251_TO_CP1257.get(ch) ?? ch).join('')
}

/**
 * Name to store for a client row from the GrinS export: unambiguous damage is
 * repaired, genuine Cyrillic is kept, anything doubtful is rejected so the
 * row is reviewed instead of creating an account with a garbled name.
 */
export function resolveImportedClientName(
  value: string,
): { ok: true; name: string; repaired: boolean } | { ok: false; reason: NameEncodingIssue } {
  const verdict = classifyNameEncoding(value)
  if (verdict.kind === 'suspicious') return { ok: false, reason: verdict.reason }
  if (verdict.kind === 'repairable') return { ok: true, name: verdict.repaired, repaired: true }
  return { ok: true, name: value, repaired: false }
}

export function classifyNameEncoding(value: string): NameEncodingVerdict {
  if (!CYRILLIC.test(value)) return { kind: 'clean' }
  const cyrillicWords = value.split(/\s+/).filter((w) => CYRILLIC.test(w))
  const wholeWords = cyrillicWords.filter((w) => CYRILLIC_ONLY_WORD.test(w) && w.length > 1)
  if (!LATIN.test(value) || wholeWords.length === cyrillicWords.length) return { kind: 'cyrillic' }

  const decoded = [...value].filter((ch) => CYRILLIC.test(ch)).map((ch) => CP1251_TO_CP1257.get(ch))
  const repaired = reinterpretCp1251AsCp1257(value)
  const suspicious = (reason: NameEncodingIssue, proposed: string | null = repaired): NameEncodingVerdict => ({
    kind: 'suspicious',
    reason,
    proposed,
  })

  if (decoded.some((ch) => ch === undefined || !/\p{L}/u.test(ch))) return suspicious('undecodable', null)
  if (wholeWords.length > 0) return suspicious('mixed-cyrillic-words', null)
  if (decoded.some((ch) => !LATVIAN_LETTERS.includes(ch!))) return suspicious('non-latvian-letter')
  const chars = [...repaired]
  if (chars.some((ch, i) => i > 0 && LATVIAN_UPPER.includes(ch) && /\p{Ll}/u.test(chars[i - 1]))) {
    return suspicious('mid-word-capital')
  }
  if ([...value].some((ch) => AMBIGUOUS.includes(ch))) return suspicious('ambiguous-ļ-or-ž')
  return { kind: 'repairable', repaired }
}
