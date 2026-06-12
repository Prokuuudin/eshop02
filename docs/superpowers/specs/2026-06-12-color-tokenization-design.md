# Color Tokenization Refactor — Design

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Author:** Aleksandr Prokudin + Claude

## Problem

The shadcn design-token system is defined ([styles/globals.css](../../../styles/globals.css),
[tailwind.config.cjs](../../../tailwind.config.cjs)) but barely used:

- `indigo-600` hardcoded 171× as the de-facto brand color (+102× indigo-400, 91× indigo-700…).
  No single source of truth for the brand color.
- 146 files hand-write `bg-white dark:bg-gray-900`, `text-gray-900 dark:text-gray-100`. Dark mode
  is maintained by hand on every class — easy to forget `dark:` and ship unreadable text.
- Semantic tokens (`bg-background`/`text-foreground`/`text-primary`) appear in only 14 files.
- Two competing token sets: legacy `--color-bg`/`--color-text` (on `body`) and shadcn
  `--background`/`--foreground`. They duplicate each other.

## Goal

One source of truth for color via CSS variables. Brand color and dark mode become automatic.
**Current visual appearance is preserved** — token values are tuned to the existing Tailwind
gray/indigo palette, not shadcn's default near-black neutral.

## Decisions (approved)

1. **Unified `--primary` brand token.** All `indigo-*` brand usages map to `primary`.
2. **Preserve current look.** Retune dark `--background`/`--card`/`--muted`/`--border` to the
   existing blue-tinted Tailwind gray palette, not shadcn near-black.
3. **Phased rollout.** Phase 0 tokens → Phase 1 high-confidence automated replacements →
   Phase 2 layered backgrounds (semi-manual).

## Phase 0 — Token values (globals.css)

Replace the `@layer base` `:root`/`.dark` blocks. HSL values tuned to Tailwind v3 palette.
All values `H S% L%` (shadcn convention, consumed as `hsl(var(--token))`).

### `:root` (light)

| Token | Source color | HSL |
|-------|-------------|-----|
| `--background` | white | `0 0% 100%` |
| `--foreground` | gray-900 | `221 39% 11%` |
| `--card` / `--popover` | white | `0 0% 100%` |
| `--card-foreground` / `--popover-foreground` | gray-900 | `221 39% 11%` |
| `--primary` | indigo-600 #4f46e5 | `243 75% 59%` |
| `--primary-foreground` | white | `0 0% 100%` |
| `--secondary` / `--muted` / `--accent` | gray-100 | `220 14% 96%` |
| `--secondary-foreground` / `--accent-foreground` | gray-900 | `221 39% 11%` |
| `--muted-foreground` | gray-500 | `220 9% 46%` |
| `--border` / `--input` | gray-200 | `220 13% 91%` |
| `--ring` | indigo-600 | `243 75% 59%` |
| `--destructive` | red-600 (keep) | `0 84% 60%` |
| `--destructive-foreground` | white | `0 0% 100%` |

### `.dark`

| Token | Source color | HSL |
|-------|-------------|-----|
| `--background` | gray-950 #030712 | `224 71% 4%` |
| `--foreground` | gray-100 | `220 14% 96%` |
| `--card` / `--popover` | gray-900 #111827 | `221 39% 11%` |
| `--card-foreground` / `--popover-foreground` | gray-100 | `220 14% 96%` |
| `--primary` | indigo-500 #6366f1 | `239 84% 67%` |
| `--primary-foreground` | white | `0 0% 100%` |
| `--secondary` / `--muted` / `--accent` | gray-800 #1f2937 | `215 28% 17%` |
| `--secondary-foreground` / `--accent-foreground` | gray-100 | `220 14% 96%` |
| `--muted-foreground` | gray-400 | `218 11% 65%` |
| `--border` / `--input` | gray-700 #374151 | `217 19% 27%` |
| `--ring` | indigo-500 | `239 84% 67%` |
| `--destructive` | red (dark) | `0 63% 31%` |
| `--destructive-foreground` | white | `0 0% 100%` |

**Dark `--primary` = indigo-500, not indigo-400.** Rationale: buttons use
`bg-primary text-primary-foreground` (white). White on indigo-400 (#818cf8) fails WCAG AA
(~2.0:1); white on indigo-500 (#6366f1) ≈ 4.5:1 (passes AA). indigo-500 is still lighter than
indigo-600, so links (`text-primary`) on dark surfaces read well. This keeps a single
`--primary-foreground: white` for both modes — no foreground flip needed.

### Also in Phase 0

- Remove the legacy `--color-bg`/`--color-text` variables and the `:root` block at the top of
  globals.css that defines them.
- Change `body` from `@apply bg-[var(--color-bg)] text-[var(--color-text)]` to
  `@apply bg-background text-foreground`.
- Keep `--header-offset`, keyframes, scrollbar, phone-input, swiper rules unchanged.

## Phase 1 — Automated high-confidence replacements

A Node script applies ordered, unambiguous regex replacements across `app/**` and
`components/**` (`.tsx`). **Longest/most-specific patterns first.** Only pairs where the target
token is unambiguous — layered backgrounds are explicitly excluded (Phase 2).

### Brand (indigo → primary)

| Pattern | Replacement |
|---------|-------------|
| `text-indigo-600 dark:text-indigo-400` | `text-primary` |
| `text-indigo-600 dark:text-indigo-300` | `text-primary` |
| `hover:text-indigo-700 dark:hover:text-indigo-300` | `hover:text-primary/90` |
| `bg-indigo-600 hover:bg-indigo-700` | `bg-primary hover:bg-primary/90` |
| `bg-indigo-600` | `bg-primary` |
| `hover:bg-indigo-700` | `hover:bg-primary/90` |
| `border-indigo-600` | `border-primary` |
| `ring-indigo-600` / `focus:ring-indigo-600` | `ring-ring` / `focus:ring-ring` |

Bare `text-indigo-600` (no dark pair) → `text-primary` only after the paired patterns above run.

**Excluded from Phase 1 (→ Phase 2):** indigo tints used as soft accent fills/borders —
`bg-indigo-50/100/900/950`, `border-indigo-100/200`, `text-indigo-300/500`. These map to
`bg-primary/10`, `bg-primary/20`, etc., and need per-site judgment.

### Text

| Pattern | Replacement |
|---------|-------------|
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-800 dark:text-gray-100` | `text-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500 dark:text-gray-300` | `text-muted-foreground` |
| `text-gray-600 dark:text-gray-300` | `text-muted-foreground` |
| `text-gray-600 dark:text-gray-400` | `text-muted-foreground` |

### Border

| Pattern | Replacement |
|---------|-------------|
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-gray-300 dark:border-gray-700` | `border-border` |
| `border-gray-200 dark:border-gray-800` | `border-border` |

The script is idempotent and reports a per-file change count. It runs only on `.tsx`; CSS is
edited by hand in Phase 0.

## Phase 2 — Layered backgrounds (semi-manual)

`bg-white dark:bg-gray-900` and friends are context-dependent and cannot be blindly mapped:

| Context | Target |
|---------|--------|
| Page / app shell | `bg-background` |
| Card / elevated panel | `bg-card` |
| Hover / inset / subtle block | `bg-muted` or `bg-secondary` |
| Input field | `bg-background` + `border-input` |

Approach: script generates **candidates** (lists each `bg-*`/`dark:bg-*` site with a suggested
token), then a human confirms per site. Done after Phase 1 is merged and stable. Out of scope for
the first implementation pass beyond producing the candidate report.

## Verification

`tsc` does not validate color classes, so verification is build + visual:

- **After each phase:** `npx tsc --noEmit` and `npx vitest run` (catch code regressions).
- **Visual diff:** a Playwright script (Playwright already in deps) captures screenshots of
  `/`, `/catalog`, `/product/[id]`, `/cart`, `/checkout` in **light and dark, before and after**.
  Compare the key screens. Spec-level acceptance = no unintended visual change in Phase 0/1.
- **Progress metric:** count remaining hardcoded classes
  (`grep -rc 'indigo-' ` and `'dark:bg-gray-'`) before/after each phase.
- **Rollback:** each phase is its own commit on a dedicated branch; revert per phase if needed.

## Risks

- **Button contrast in dark** — mitigated by `--primary` dark = indigo-500 (see Phase 0).
- **Phase 1 leaves backgrounds untouched** → transient mix of tokens + hardcoded grays. Acceptable:
  the look does not break, since unconverted classes keep working.
- **`ring-indigo-600` → `ring-ring`** assumes ring is the brand color; verify focus rings still
  read on both themes (ring = indigo, ok).
- **Automated regex over-match** — patterns are anchored to full class strings with their `dark:`
  pair; bare single-color replacements run last and only for the solid brand shades.

## Out of scope

- Phase 2 execution (only the candidate report is produced in the first pass).
- Component structural/layout changes, z-index scale, auth-context (separate efforts).
- Status colors (badges: red/green/yellow) stay as-is — semantic, not brand.
