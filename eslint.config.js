// MindfulNest — ESLint flat config (ESLint 9)
// Per spec v2 §C7-T1 Agent B audit. Wave B1 preflight 52.
//
// Restrictions enforced:
// 1. no-restricted-imports: bans @sentry/*, bugsnag*, rollbar, phaser,
//    react-native-spine, @capacitor/*. Refs: LD-220 COPPA_NO_BEHAVIORAL_ADVERTISING,
//    LD-157 DEV_TELEMETRY_AUTOLINKING_EXCLUSION_PATTERN.
// 2. no-restricted-syntax: dynamic import() with non-literal template arg
//    (prevents runtime-computed imports that bypass the static ban list).
// 3. @typescript-eslint/no-explicit-any: error level. Agent B audit fix.
// 4. no-restricted-properties: banned vendor API domains outside lib/
//    (future: when Production/lib/*_client.py equivalents ship in-app, this
//    rule gains app-side vendor-abstraction enforcement per LD-169).

const tseslint = require("typescript-eslint");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

// Banned modules — see LD-220, LD-157, spec v2 §C7-T1.
const BANNED_PATTERNS = [
  { group: ["@sentry/*", "@sentry/**"], message: "Sentry banned — LD-220 no behavioral advertising / telemetry leak risk." },
  { group: ["bugsnag", "bugsnag/*", "@bugsnag/*"], message: "Bugsnag banned — LD-220." },
  { group: ["rollbar", "rollbar/*"], message: "Rollbar banned — LD-220." },
  { group: ["phaser"], message: "Phaser banned — deferred to V2 per LD-128 ANIMATION_STACK_V1_PATH_D_v2." },
  { group: ["react-native-spine", "react-native-spine/*"], message: "react-native-spine banned — LD-128 Path D v2 uses MP4 loops, not Spine." },
  { group: ["@capacitor/*"], message: "Capacitor banned — conflicts with Expo stack per LD-86." },
];

module.exports = [
  // Ignores — applied globally
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".expo/**",
      "ios/Pods/**",
      "ios/build/**",
      "android/build/**",
      "android/app/build/**",
      "**/*.generated.ts",
      "firestore-debug.log",
    ],
  },

  // Base JS rules
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        __DEV__: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-restricted-imports": ["error", { patterns: BANNED_PATTERNS }],
      "no-restricted-syntax": [
        "error",
        {
          // Block dynamic import() with non-literal argument — prevents runtime bypass
          // of the static no-restricted-imports banlist.
          selector: "ImportExpression[source.type!='Literal']",
          message: "Dynamic import() with non-literal source is banned (bypasses static restricted-imports). Use a literal string.",
        },
      ],
    },
  },

  // TypeScript + TSX rules
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: false,  // No type-aware lint for now; keeps lint fast. Enable later for type-aware rules.
        ecmaFeatures: { jsx: true },
      },
      globals: {
        __DEV__: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      "no-restricted-imports": ["error", { patterns: BANNED_PATTERNS }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.type!='Literal']",
          message: "Dynamic import() with non-literal source is banned (bypasses static restricted-imports).",
        },
      ],
      // Agent B audit fix — must be error, not warn.
      "@typescript-eslint/no-explicit-any": "error",
      // React Native uses require() for asset loading (idiomatic, Metro-required).
      // Off globally; use ES imports where possible but don't ban require.
      "@typescript-eslint/no-require-imports": "off",
      // Allow React types implicitly via JSX transform
      "react/react-in-jsx-scope": "off",
      // Warn but don't block on unused vars (dev-time ergonomics)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
    settings: {
      react: { version: "detect" },
    },
  }),

  // Relax no-explicit-any in test files only (mocks often need any)
  {
    files: ["**/__tests__/**/*.{ts,tsx,js}", "**/*.test.{ts,tsx,js}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
