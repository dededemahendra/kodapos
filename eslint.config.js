import tseslint from 'typescript-eslint';
import pluginLingui from 'eslint-plugin-lingui';

export default tseslint.config(
  // Global ignores — files ESLint should never process at all
  {
    ignores: [
      'src/locales/**',
      'src/routeTree.gen.ts',
      'src/components/ui/**',
      'convex/**',
      'dist/**',
      '.output/**',
    ],
  },
  // Spread the flat/recommended lingui rules (t-call-in-function, no-single-variables-to-translate, etc.)
  {
    ...pluginLingui.configs['flat/recommended'],
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.ts',
      'src/locales/**',
      'src/routeTree.gen.ts',
      'src/components/ui/**',
      'convex/**',
      'dist/**',
      '.output/**',
    ],
  },
  // Our custom layer: add no-unlocalized-strings (warn) with noise-reduction options,
  // and override t-call-in-function / no-single-variables-to-translate to error.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.ts',
      'src/locales/**',
      'src/routeTree.gen.ts',
      'src/components/ui/**',
      'convex/**',
      'dist/**',
      '.output/**',
    ],
    plugins: {
      lingui: pluginLingui,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // JSX is parsed by @typescript-eslint/parser natively
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Upgrade rules from recommended that we want as errors
      'lingui/t-call-in-function': 'error',
      'lingui/no-single-variables-to-translate': 'error',

      // Primary i18n guard — warn (non-blocking) with options to reduce noise
      'lingui/no-unlocalized-strings': [
        'warn',
        {
          // Regex patterns for string *values* to silently ignore:
          // - all-caps/short tokens (e.g. "ID", "USD", "XL", "POST")
          // - strings that look like CSS classes, identifiers, or paths
          // - numeric-only strings
          ignore: [
            '^[A-Z0-9_/-]+$',        // SCREAMING_CASE, IDs, paths: "USD", "API_KEY"
            '^[a-z][a-z0-9-]*$',     // lowercase-kebab: css classes, html tags, routes
            '^\\d+(\\.\\d+)?$',       // pure numbers: "42", "3.14"
            '^\\/.*',                  // URL paths: "/api/users"
            '^#[0-9a-fA-F]{3,8}$',   // hex colors: "#fff", "#1a2b3c"
          ],
          // Prop/variable names to ignore (className, data-*, aria-*, etc.)
          ignoreNames: [
            // HTML/React attribute names that are never copy
            'className',
            'id',
            'name',
            'type',
            'href',
            'src',
            'alt',
            'rel',
            'target',
            'role',
            'htmlFor',
            'key',
            'style',
            'tabIndex',
            'autoComplete',
            'autoFocus',
            'placeholder', // intentional: placeholder copy should be translated; remove if too noisy
            // data-* and aria-* via regex
            { regex: { pattern: '^data-', flags: 'i' } },
            { regex: { pattern: '^aria-', flags: 'i' } },
            // Tailwind/styling utilities
            { regex: { pattern: '^(variant|size|color|theme|align|side|sideOffset|avoidCollisions)$' } },
          ],
          // Functions whose string arguments don't need translation
          ignoreFunctions: [
            // Router / navigation helpers
            'navigate',
            'redirect',
            'useNavigate',
            // Class/style utilities
            'cn',
            'clsx',
            'cva',
            'twMerge',
            // Console (dev-only)
            'console.log',
            'console.warn',
            'console.error',
            'console.info',
            // Test helpers (just in case)
            'describe',
            'it',
            'test',
            'expect',
            // Convex
            'query',
            'mutation',
            'action',
            'internalQuery',
            'internalMutation',
            'internalAction',
          ],
        },
      ],
    },
  },
);
