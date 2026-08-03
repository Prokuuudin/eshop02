const TARGETS = [
  'app/[lang]/blog',
  'app/[lang]/catalog',
  'app/[lang]/category',
  'app/[lang]/contact',
  'app/[lang]/stores',
  'components/BlogCard.tsx',
  'components/BlogSubscribeForm.tsx',
  'components/Stores.tsx',
  'data/company.ts',
  'data/stores.ts',
]
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md'])
const MOJIBAKE = /(?:Ã.|Â.|â(?:€|™|œ|ž|š|ž|‚|„)|Ð[\x80-\xBF]|Ñ[\x80-\xBF]|Ä[\x80-\xBF]|Å[\x80-\xBF])/u

const { readdir, readFile } = await import('node:fs/promises')
const { extname, join } = await import('node:path')
const { stat } = await import('node:fs/promises')

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  }))
  return nested.flat()
}

const files = (await Promise.all(TARGETS.map(async (target) => {
  const targetStat = await stat(target)
  return targetStat.isDirectory() ? filesIn(target) : [target]
})))
  .flat()
  .filter((file) => EXTENSIONS.has(extname(file)))
const failures = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  text.split(/\r?\n/u).forEach((line, index) => {
    if (MOJIBAKE.test(line)) failures.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`)
  })
}

if (failures.length > 0) {
  console.error(`Possible mojibake found:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Encoding check passed (${files.length} SEO-critical public source files).`)
}
