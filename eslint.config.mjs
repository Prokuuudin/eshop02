import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// eslint-config-next already registers the jsx-a11y plugin and wires up a handful of its rules
// (alt-text, aria-props, aria-proptypes, aria-unsupported-elements, role-has-required-aria-props,
// role-supports-aria-props) at 'warn'. Layer the rest of the jsx-a11y "recommended" preset on top
// so more accessibility issues get surfaced, but force every rule the preset doesn't already turn
// off to 'warn' — computed from the preset itself so a future recommended-rules update can't
// silently turn CI red by shipping new 'error' entries.
//
// Note: we deliberately do NOT re-declare the `jsx-a11y` entry in `plugins` here. The plugin
// object jsx-a11y.flatConfigs.recommended ships is a different instance than the one
// eslint-config-next already wires up internally (it wraps the module for ESM interop), and flat
// config throws "Cannot redefine plugin" if two config objects register the same plugin name
// with different instances. Referencing `jsx-a11y/*` rules without a `plugins` key here works
// because we scope `files` below to the same glob eslint-config-next uses to register the
// plugin — outside that glob (e.g. tailwind.config.cjs) the plugin isn't registered anywhere,
// and referencing its rules there would fail with "could not find plugin jsx-a11y".
const jsxA11yWarnRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([ruleId, severity]) => {
    const [level, ...options] = Array.isArray(severity) ? severity : [severity]
    const warnLevel = level === 'error' || level === 2 ? 'warn' : level
    return [ruleId, options.length ? [warnLevel, ...options] : warnLevel]
  })
)

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: jsxA11yWarnRules,
  },
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      // Existing effects are migrated incrementally; keep the React 19 rule visible
      // without making the toolchain upgrade itself block all CI checks.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    '.agents/**',
    '.claude/**',
    '.superpowers/**',
    '.vercel/**',
    '.vscode/**',
    'coverage/**',
    'generated/**',
    'playwright-report/**',
    'test-results/**',
  ]),
])
