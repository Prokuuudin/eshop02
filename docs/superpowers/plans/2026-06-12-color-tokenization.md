# Color Tokenization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `indigo-*` / `gray-*` dark-pair color classes with shadcn semantic tokens, so the brand color and dark mode live in one place (CSS variables) and current appearance is preserved.

**Architecture:** Phase 0 retunes the CSS token values (globals.css) to the existing Tailwind palette. Phase 1 runs an idempotent Node codemod that replaces unambiguous full-class patterns across `app/**` and `components/**`. Phase 2 emits a candidate report for layered backgrounds (no auto-edit). Verification is grep metrics + `tsc` + `vitest` + Playwright before/after screenshots.

**Tech Stack:** Next.js 16, Tailwind 3.4, shadcn tokens, Node (ESM codemod script), Playwright (visual diff), Vitest.

**Spec:** [docs/superpowers/specs/2026-06-12-color-tokenization-design.md](../specs/2026-06-12-color-tokenization-design.md)

---

## File Structure

- `styles/globals.css` — token values (Phase 0). Modify `@layer base` `:root`/`.dark`, remove legacy `--color-bg`/`--color-text`, switch `body`.
- `scripts/color-codemod.mjs` — Phase 1 codemod (create). Ordered literal replacements, dry-run + apply modes, per-file report.
- `scripts/color-bg-candidates.mjs` — Phase 2 candidate report generator (create). Read-only; lists `bg-*`/`dark:bg-*` sites with suggested tokens.
- `scripts/color-screenshots.mjs` — Playwright visual capture (create). Captures key routes in light+dark.
- `docs/superpowers/reports/color-bg-candidates.md` — generated Phase 2 report (output).

---

## Task 1: Phase 0 — Retune CSS tokens

**Files:**
- Modify: `styles/globals.css`

- [ ] **Step 1: Capture baseline grep metrics**

Run:
```bash
cd "c:/Users/User/Desktop/eshop02"
grep -rc "indigo-" app components --include=*.tsx | awk -F: '{s+=$2} END{print "indigo total:", s}'
grep -rc "dark:bg-gray-" app components --include=*.tsx | awk -F: '{s+=$2} END{print "dark:bg-gray total:", s}'
grep -rc "dark:text-gray-" app components --include=*.tsx | awk -F: '{s+=$2} END{print "dark:text-gray total:", s}'
```
Expected: prints three nonzero totals (record them; ~indigo 600+, dark:bg-gray ~615, dark:text-gray large). These are the before-numbers.

- [ ] **Step 2: Replace the `@layer base` token block**

In `styles/globals.css`, replace the entire `@layer base { :root { … } .dark { … } }` block (the one defining `--background`, `--foreground`, … `--radius`) with:

```css
@layer base {
    :root {
        --background: 0 0% 100%;
        --foreground: 221 39% 11%;
        --card: 0 0% 100%;
        --card-foreground: 221 39% 11%;
        --popover: 0 0% 100%;
        --popover-foreground: 221 39% 11%;
        --primary: 243 75% 59%;
        --primary-foreground: 0 0% 100%;
        --secondary: 220 14% 96%;
        --secondary-foreground: 221 39% 11%;
        --muted: 220 14% 96%;
        --muted-foreground: 220 9% 46%;
        --accent: 220 14% 96%;
        --accent-foreground: 221 39% 11%;
        --destructive: 0 84% 60%;
        --destructive-foreground: 0 0% 100%;
        --border: 220 13% 91%;
        --input: 220 13% 91%;
        --ring: 243 75% 59%;
        --chart-1: 12 76% 61%;
        --chart-2: 173 58% 39%;
        --chart-3: 197 37% 24%;
        --chart-4: 43 74% 66%;
        --chart-5: 27 87% 67%;
        --radius: 0.5rem;
    }
    .dark {
        --background: 224 71% 4%;
        --foreground: 220 14% 96%;
        --card: 221 39% 11%;
        --card-foreground: 220 14% 96%;
        --popover: 221 39% 11%;
        --popover-foreground: 220 14% 96%;
        --primary: 239 84% 67%;
        --primary-foreground: 0 0% 100%;
        --secondary: 215 28% 17%;
        --secondary-foreground: 220 14% 96%;
        --muted: 215 28% 17%;
        --muted-foreground: 218 11% 65%;
        --accent: 215 28% 17%;
        --accent-foreground: 220 14% 96%;
        --destructive: 0 63% 31%;
        --destructive-foreground: 0 0% 100%;
        --border: 217 19% 27%;
        --input: 217 19% 27%;
        --ring: 239 84% 67%;
        --chart-1: 220 70% 50%;
        --chart-2: 160 60% 45%;
        --chart-3: 30 80% 55%;
        --chart-4: 280 65% 60%;
        --chart-5: 340 75% 55%;
    }
}
```

- [ ] **Step 3: Remove legacy `--color-bg`/`--color-text` and switch `body`**

In `styles/globals.css`, find the top `:root` block:
```css
:root {
    --color-bg: #ffffff;
    --color-text: #111827;
    --header-offset: 150px;
}
```
Replace with (keep only `--header-offset`):
```css
:root {
    --header-offset: 150px;
}
```

Then find the `body` rule:
```css
body {
    @apply bg-[var(--color-bg)] text-[var(--color-text)] antialiased;
```
Replace the `@apply` line with:
```css
body {
    @apply bg-background text-foreground antialiased;
```
Leave the rest of the `body` rule (font-family, overflow) unchanged.

- [ ] **Step 4: Verify no stale legacy variable references remain**

Run:
```bash
grep -rn "color-bg\|color-text" styles app components --include=*.css --include=*.tsx
```
Expected: no matches (empty output). If any `var(--color-bg)`/`var(--color-text)` remain in JSX, replace those occurrences with `bg-background`/`text-foreground` utility classes.

- [ ] **Step 5: Typecheck + unit tests (regression gate)**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: tsc exit 0; vitest shows the same pass/fail baseline as before this work (the pre-existing `lib/search.test.ts` failure is unrelated and expected; everything else passes).

- [ ] **Step 6: Commit**

```bash
git add styles/globals.css
git commit -m "refactor(styles): retune shadcn tokens to current palette, drop legacy --color-bg/--color-text"
```

---

## Task 2: Phase 1 — Write the codemod script (dry-run first)

**Files:**
- Create: `scripts/color-codemod.mjs`

- [ ] **Step 1: Write the codemod script**

Create `scripts/color-codemod.mjs`:

```js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const APPLY = process.argv.includes('--apply')

// Ordered literal replacements. Longest / most specific FIRST.
// Each entry: [from, to]. Applied with split/join (literal, global) per file.
const REPLACEMENTS = [
  // ── Brand: paired indigo (light + dark) ─────────────────────────────
  ['text-indigo-600 dark:text-indigo-400', 'text-primary'],
  ['text-indigo-600 dark:text-indigo-300', 'text-primary'],
  ['hover:text-indigo-700 dark:hover:text-indigo-300', 'hover:text-primary/90'],
  ['hover:text-indigo-700 dark:hover:text-indigo-400', 'hover:text-primary/90'],
  ['bg-indigo-600 hover:bg-indigo-700', 'bg-primary hover:bg-primary/90'],
  // ── Brand: solid single-shade (run after pairs) ─────────────────────
  ['hover:bg-indigo-700', 'hover:bg-primary/90'],
  ['bg-indigo-700', 'bg-primary'],
  ['bg-indigo-600', 'bg-primary'],
  ['border-indigo-600', 'border-primary'],
  ['focus:ring-indigo-600', 'focus:ring-ring'],
  ['ring-indigo-600', 'ring-ring'],
  ['dark:text-indigo-400', 'dark:text-primary'],
  ['dark:text-indigo-300', 'dark:text-primary'],
  ['text-indigo-600', 'text-primary'],
  // ── Text: gray foreground pairs ─────────────────────────────────────
  ['text-gray-900 dark:text-gray-100', 'text-foreground'],
  ['text-gray-800 dark:text-gray-100', 'text-foreground'],
  ['text-gray-900 dark:text-white', 'text-foreground'],
  ['text-gray-500 dark:text-gray-400', 'text-muted-foreground'],
  ['text-gray-500 dark:text-gray-300', 'text-muted-foreground'],
  ['text-gray-600 dark:text-gray-300', 'text-muted-foreground'],
  ['text-gray-600 dark:text-gray-400', 'text-muted-foreground'],
  // ── Border pairs ────────────────────────────────────────────────────
  ['border-gray-200 dark:border-gray-700', 'border-border'],
  ['border-gray-300 dark:border-gray-700', 'border-border'],
  ['border-gray-200 dark:border-gray-800', 'border-border'],
]

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else if (name.endsWith('.tsx')) files.push(full)
  }
  return files
}

let totalHits = 0
let changedFiles = 0
const perPattern = new Map(REPLACEMENTS.map(([from]) => [from, 0]))

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let src = readFileSync(file, 'utf8')
    const before = src
    let fileHits = 0
    for (const [from, to] of REPLACEMENTS) {
      if (!src.includes(from)) continue
      const count = src.split(from).length - 1
      perPattern.set(from, perPattern.get(from) + count)
      fileHits += count
      src = src.split(from).join(to)
    }
    if (fileHits > 0) {
      totalHits += fileHits
      changedFiles++
      if (APPLY && src !== before) writeFileSync(file, src)
      console.log(`${APPLY ? 'applied' : 'would change'}: ${file} (${fileHits})`)
    }
  }
}

console.log('\n── Per-pattern hits ──')
for (const [from, n] of perPattern) if (n > 0) console.log(`${n}\t${from}`)
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${totalHits} replacements across ${changedFiles} files`)
```

- [ ] **Step 2: Dry-run and inspect**

Run:
```bash
cd "c:/Users/User/Desktop/eshop02"
node scripts/color-codemod.mjs
```
Expected: prints a list of files with hit counts, a per-pattern breakdown, and a final `DRY RUN — N replacements across M files` line with N in the hundreds. No files are modified (verify with `git status` — clean except the new script).

- [ ] **Step 3: Commit the script**

```bash
git add scripts/color-codemod.mjs
git commit -m "build: add color tokenization codemod (dry-run)"
```

---

## Task 3: Phase 1 — Capture before screenshots (visual baseline)

**Files:**
- Create: `scripts/color-screenshots.mjs`

> This task is best-effort: it needs the dev server running and a seeded DB. If the dev server or DB is unavailable, skip to Task 4 and rely on grep metrics + tsc + vitest, and do a manual spot-check of `/` and `/catalog` in the browser instead.

- [ ] **Step 1: Write the screenshot script**

Create `scripts/color-screenshots.mjs`:

```js
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:3000'
const LABEL = process.argv[2] || 'before'
const ROUTES = [
  ['home', '/'],
  ['catalog', '/catalog'],
  ['product', '/product/p1'],
  ['cart', '/cart'],
  ['checkout', '/checkout'],
]
const THEMES = ['light', 'dark']

const outDir = `test-results/color-${LABEL}`
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
for (const theme of THEMES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
  })
  const page = await ctx.newPage()
  for (const [name, route] of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.screenshot({ path: `${outDir}/${name}-${theme}.png`, fullPage: true })
      console.log(`captured ${name} ${theme}`)
    } catch (e) {
      console.warn(`skip ${name} ${theme}: ${e.message}`)
    }
  }
  await ctx.close()
}
await browser.close()
console.log(`Screenshots in ${outDir}`)
```

- [ ] **Step 2: Start dev server (separate terminal) and capture baseline**

Run (in a background/second shell):
```bash
npm run dev
```
Wait until it logs `Ready`. Then:
```bash
node scripts/color-screenshots.mjs before
```
Expected: PNGs written to `test-results/color-before/` for the reachable routes in light and dark.

- [ ] **Step 3: Commit the script (screenshots are gitignored build output)**

```bash
git add scripts/color-screenshots.mjs
git commit -m "build: add Playwright color screenshot script"
```

---

## Task 4: Phase 1 — Apply the codemod

**Files:**
- Modify: many `app/**/*.tsx`, `components/**/*.tsx` (via codemod)

- [ ] **Step 1: Apply**

Run:
```bash
cd "c:/Users/User/Desktop/eshop02"
node scripts/color-codemod.mjs --apply
```
Expected: same counts as the dry run, prefixed `applied:`, ending `APPLIED — N replacements across M files`.

- [ ] **Step 2: Sanity-check the diff**

Run:
```bash
git diff --stat | tail -5
git diff -- components/ProductCard.tsx
```
Expected: `ProductCard.tsx` shows `hover:text-indigo-600` → ... and `text-gray-500 dark:text-gray-300` → `text-muted-foreground`, etc. No structural/JSX changes, only className strings.

- [ ] **Step 3: Typecheck + unit tests**

Run:
```bash
npx tsc --noEmit && npx vitest run
```
Expected: tsc exit 0; vitest same baseline (only the pre-existing `lib/search.test.ts` failure).

- [ ] **Step 4: After screenshots + visual compare (best-effort)**

If Task 3 ran: with the dev server running,
```bash
node scripts/color-screenshots.mjs after
```
Open `test-results/color-before/*` vs `test-results/color-after/*` side by side for `home`, `catalog`, `product` in both themes. Expected: brand color and grays look the same (primary = indigo, text/border unchanged). Note any regressions for Step 6.

- [ ] **Step 5: Progress metric**

Run:
```bash
grep -rc "indigo-" app components --include=*.tsx | awk -F: '{s+=$2} END{print "indigo remaining:", s}'
grep -rc "dark:text-gray-" app components --include=*.tsx | awk -F: '{s+=$2} END{print "dark:text-gray remaining:", s}'
```
Expected: `indigo remaining` dropped sharply (only tints `indigo-50/100/200/300/500/900/950` remain → Phase 2). `dark:text-gray` reduced (paired foreground/muted patterns gone; layered ones remain → Phase 2).

- [ ] **Step 6: Fix any visual regressions found in Step 4**

For each regression: locate the offending className (e.g., a button whose text lost contrast) and adjust manually — usually `text-primary-foreground` on `bg-primary`, or revert that one site to an explicit utility. Re-run `npx tsc --noEmit`. If no regressions, skip.

- [ ] **Step 7: Commit**

```bash
git add app components
git commit -m "refactor(styles): tokenize brand + foreground/border colors (Phase 1 codemod)"
```

---

## Task 5: Phase 2 — Layered-background candidate report (no auto-edit)

**Files:**
- Create: `scripts/color-bg-candidates.mjs`
- Create (output): `docs/superpowers/reports/color-bg-candidates.md`

- [ ] **Step 1: Write the candidate report generator**

Create `scripts/color-bg-candidates.mjs`:

```js
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']

// Heuristic suggestions for remaining bg pairs. NOT applied — human decides.
const SUGGEST = [
  ['bg-white dark:bg-gray-900', 'bg-card (elevated) OR bg-background (page)'],
  ['bg-white dark:bg-gray-800', 'bg-card'],
  ['bg-gray-50 dark:bg-gray-900', 'bg-muted OR bg-background'],
  ['bg-gray-50 dark:bg-gray-800', 'bg-muted'],
  ['bg-gray-100 dark:bg-gray-800', 'bg-muted'],
  ['bg-gray-100 dark:bg-gray-700', 'bg-secondary'],
  ['bg-gray-200 dark:bg-gray-700', 'bg-secondary'],
  ['bg-gray-950', 'bg-background'],
]

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else if (name.endsWith('.tsx')) files.push(full)
  }
  return files
}

const rows = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    for (const [pattern, suggestion] of SUGGEST) {
      const count = src.split(pattern).length - 1
      if (count > 0) rows.push({ file, pattern, suggestion, count })
    }
  }
}

rows.sort((a, b) => b.count - a.count)
mkdirSync('docs/superpowers/reports', { recursive: true })
const lines = [
  '# Phase 2 — Layered background candidates',
  '',
  'Review each site and apply the suggested token by hand. Page shell -> `bg-background`,',
  'elevated card -> `bg-card`, subtle/hover block -> `bg-muted`/`bg-secondary`.',
  '',
  '| Count | Pattern | Suggested | File |',
  '|------:|---------|-----------|------|',
  ...rows.map((r) => `| ${r.count} | \`${r.pattern}\` | ${r.suggestion} | ${r.file} |`),
  '',
  `Total sites: ${rows.reduce((s, r) => s + r.count, 0)}`,
]
writeFileSync('docs/superpowers/reports/color-bg-candidates.md', lines.join('\n'))
console.log(`Wrote report with ${rows.length} rows`)
```

- [ ] **Step 2: Generate the report**

Run:
```bash
cd "c:/Users/User/Desktop/eshop02"
node scripts/color-bg-candidates.mjs
```
Expected: prints `Wrote report with N rows` and creates `docs/superpowers/reports/color-bg-candidates.md` listing background sites with suggested tokens.

- [ ] **Step 3: Commit**

```bash
git add scripts/color-bg-candidates.mjs docs/superpowers/reports/color-bg-candidates.md
git commit -m "build: add Phase 2 layered-background candidate report"
```

- [ ] **Step 4: Hand off Phase 2 execution**

Phase 2 (applying background tokens per the report) is a separate, human-reviewed pass — not part of this plan's automated scope. Stop here and report metrics: before/after `indigo-` and `dark:bg-gray-` counts, files changed, and the candidate-report total.

---

## Self-Review Notes

- **Spec coverage:** Phase 0 (Task 1), Phase 1 codemod (Tasks 2–4), Phase 2 candidates (Task 5), verification (grep + tsc + vitest in every task, Playwright Tasks 3/4). Legacy `--color-bg`/`--color-text` removal = Task 1 Steps 3–4. All spec sections mapped.
- **Token contrast:** dark `--primary` = `239 84% 67%` (indigo-500), `--primary-foreground: 0 0% 100%` both modes — matches spec contrast decision.
- **Pattern order:** paired indigo before bare; `bg-indigo-600 hover:bg-indigo-700` before bare `bg-indigo-600`/`hover:bg-indigo-700` — prevents partial-match drift.
- **No placeholders:** all script bodies and CSS blocks are complete and runnable.
