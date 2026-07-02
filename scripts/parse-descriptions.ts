/**
 * Splits raw FullDescription HTML into: description (intro text) + up to 4 "feature"
 * bullets (bold-labelled sub-sections like "Lietošana:") + technicalSpecs["<label>"]
 * for the ingredients/composition block. No wording is altered — only HTML tags are
 * stripped and HTML entities decoded (e.g. &scaron; -> š); every original word ends
 * up in description, a feature, or technicalSpecs. Nothing is dropped: if more than
 * 4 non-ingredient labelled chunks exist, the overflow is appended to `description`.
 *
 * Block-level tag boundaries (</p>, <br>, </li>, ...) are kept as newlines, so the
 * stored description preserves paragraphs (\n\n). When the source has NO bold labels,
 * the text is split by sentences instead: the first 2 sentences stay as the short
 * description, the rest become feature bullets (bullet 4 absorbs any remainder).
 *
 * Run with --sample=N to preview N random parses without touching the DB.
 */
import { readFileSync } from 'fs'
import { decode } from 'he'

const LABEL_TAG_RE = /<(strong|b)>\s*(?:<(em|i)>)?\s*([^<>{}:]{2,40}):\s*(?:<\/\2>)?\s*<\/\1>/gi
const BARE_INGREDIENTS_RE = /\b(INGREDIENTS)\s*:/gi
const INGREDIENT_LABEL_RE = /ingredient|sast[āa]v|состав/i
const DESCRIPTION_LABEL_RE = /^apraksts$|^description$|^описание$/i

type Chunk = { label: string | null; html: string }

const flattenWs = (s: string): string => s.replace(/\s+/g, ' ').trim()

function stripAndDecode(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|table)\s*>/gi, '\n\n')
    .replace(/<\/\s*(li|tr)\s*>/gi, '\n')
  const noTags = withBreaks.replace(/<[^>]*>/g, ' ')
  const decoded = decode(noTags)
  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

// Deliberately conservative: a missed split leaves a longer sentence (harmless),
// a false split chops a sentence in half (visible damage).
const ABBREVIATIONS = new Set([
  'мл', 'гр', 'кг', 'шт', 'др', 'арт', 'ок', 'см', 'мм', 'руб',
  'ml', 'gr', 'oz', 'no', 'nr', 'approx', 'inc', 'ltd', 'art',
  'piem', 'utt', 'gab', 'min', 'max',
])

const SENTENCE_START_RE = /[A-ZА-ЯЁĀČĒĢĪĶĻŅŠŪŽ0-9«"„(]/

function splitLine(line: string): string[] {
  const sentences: string[] = []
  let start = 0
  const re = /[.!?…]+\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const next = line.charAt(m.index + m[0].length)
    if (!next || !SENTENCE_START_RE.test(next)) continue
    const lastWord = line.slice(start, m.index).split(/\s+/).pop() ?? ''
    const bare = lastWord.replace(/[()«»"„'’]/g, '')
    if (bare.includes('.') || /^\p{L}$/u.test(bare)) continue
    if (ABBREVIATIONS.has(bare.toLowerCase())) continue
    const terminatorEnd = m.index + m[0].trimEnd().length
    const candidate = line.slice(start, terminatorEnd).trim()
    if (candidate.length < 4) continue
    sentences.push(candidate)
    start = m.index + m[0].length
  }
  const tail = line.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((chunk) => splitLine(chunk.trim()))
    .filter(Boolean)
}

function splitIntoChunks(html: string): Chunk[] {
  type Marker = { index: number; length: number; label: string }
  const markers: Marker[] = []

  for (const m of html.matchAll(LABEL_TAG_RE)) {
    markers.push({ index: m.index!, length: m[0].length, label: m[3].trim() })
  }
  for (const m of html.matchAll(BARE_INGREDIENTS_RE)) {
    // skip if this occurrence is already inside a bold tag match (avoid double-counting)
    const insideExisting = markers.some((mk) => m.index! >= mk.index && m.index! < mk.index + mk.length)
    if (!insideExisting) markers.push({ index: m.index!, length: m[0].length, label: m[1].trim() })
  }
  markers.sort((a, b) => a.index - b.index)

  if (markers.length === 0) {
    return [{ label: null, html }]
  }

  const chunks: Chunk[] = []
  const intro = html.slice(0, markers[0].index)
  if (intro.trim()) chunks.push({ label: null, html: intro })

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i].length
    const end = i + 1 < markers.length ? markers[i + 1].index : html.length
    chunks.push({ label: markers[i].label, html: html.slice(start, end) })
  }
  return chunks
}

export type ParsedDescription = {
  description: string | null
  features: string[]
  technicalSpecs: Record<string, string>
}

export function parseDescription(rawHtml: string): ParsedDescription {
  const chunks = splitIntoChunks(rawHtml)
  let description = ''
  const features: string[] = []
  const technicalSpecs: Record<string, string> = {}
  const overflow: string[] = []

  for (const chunk of chunks) {
    const text = stripAndDecode(chunk.html)
    if (!text) continue
    const label = chunk.label === null ? null : decode(chunk.label).trim()

    if (label === null || DESCRIPTION_LABEL_RE.test(label)) {
      description = description ? `${description}\n\n${text}` : text
    } else if (INGREDIENT_LABEL_RE.test(label)) {
      technicalSpecs[label] = flattenWs(text)
    } else if (features.length < 4) {
      features.push(flattenWs(`${label}: ${text}`))
    } else {
      overflow.push(flattenWs(`${label}: ${text}`))
    }
  }

  if (overflow.length > 0) {
    const tail = overflow.join('\n\n')
    description = description ? `${description}\n\n${tail}` : tail
  }

  // Label-less text: first 2 sentences stay as the short description, the rest
  // become feature bullets (one sentence each, bullet 4 absorbs the remainder).
  if (features.length === 0 && description) {
    const sentences = splitSentences(description)
    if (sentences.length >= 3) {
      description = sentences.slice(0, 2).join(' ')
      const rest = sentences.slice(2)
      if (rest.length <= 4) {
        features.push(...rest)
      } else {
        features.push(rest[0], rest[1], rest[2], rest.slice(3).join(' '))
      }
    }
  }

  return { description: description || null, features, technicalSpecs }
}

function main() {
  const sampleArg = process.argv.find((a) => a.startsWith('--sample='))
  const sampleSize = sampleArg ? Number(sampleArg.split('=')[1]) : 0
  if (sampleSize === 0) {
    console.log('Usage: npx tsx scripts/parse-descriptions.ts --sample=N')
    return
  }

  const raw = readFileSync('C:/Temp/migration/full_descriptions.json', 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const sanitized = noWraps.replace(/[\x00-\x1F]/g, ' ')
  const parsed = JSON.parse(sanitized)
  const rows: { id: string; fullDescription: string }[] = parsed.data ?? parsed

  // Stratified-ish sample: mix of random picks so we see both labelled and plain cases.
  const shuffled = [...rows].sort(() => Math.random() - 0.5)
  const sample = shuffled.slice(0, sampleSize)

  for (const row of sample) {
    const result = parseDescription(row.fullDescription)
    console.log(`\n${'='.repeat(80)}\nID ${row.id}`)
    console.log(`--- description ---\n${result.description}`)
    result.features.forEach((f, i) => console.log(`--- feature${i + 1} ---\n${f}`))
    for (const [k, v] of Object.entries(result.technicalSpecs)) {
      console.log(`--- technicalSpecs["${k}"] ---\n${v}`)
    }
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/parse-descriptions.ts')) {
  main()
}
