/**
 * Splits raw FullDescription HTML into: description (intro text) + up to 4 "feature"
 * bullets (bold-labelled sub-sections like "Lietošana:") + technicalSpecs["<label>"]
 * for the ingredients/composition block. No wording is altered — only HTML tags are
 * stripped and HTML entities decoded (e.g. &scaron; -> š); every original word ends
 * up in description, a feature, or technicalSpecs. Nothing is dropped: if more than
 * 4 non-ingredient labelled chunks exist, the overflow is appended to `description`.
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

function stripAndDecode(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, ' ')
  const decoded = decode(noTags)
  return decoded.replace(/\s+/g, ' ').trim()
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
      description = description ? `${description} ${text}` : text
    } else if (INGREDIENT_LABEL_RE.test(label)) {
      technicalSpecs[label] = text
    } else if (features.length < 4) {
      features.push(`${label}: ${text}`)
    } else {
      overflow.push(`${label}: ${text}`)
    }
  }

  if (overflow.length > 0) {
    description = description ? `${description} ${overflow.join(' ')}` : overflow.join(' ')
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
