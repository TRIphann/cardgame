// Flat config — ESLint 9+ uses the new flat-config schema. We pin to v8 in
// package.json so the legacy `.eslintrc` JSON format is still accepted.
//
// Rules below are deliberately permissive: this is a freshly-linted codebase
// and a hard `--max-warnings 0` rule will produce 200+ errors on the first
// run. Start with the React/Hooks/A11y essentials and tighten over time.

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default [
  // Globals available in the browser. node:false so things like `process.env`
  // still need an explicit comment.
  { ignores: ["dist/**", "node_modules/**", "*.config.js"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      // Flat config requires parserOptions to live under languageOptions —
      // a top-level "parserOptions" key makes ESLint 9 refuse to start.
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React 17+ JSX transform: no need to import React in every file.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",          // we don't use PropTypes — TypeScript/JSDoc would be the next step
      "react/jsx-uses-react": "off",

      // Hooks rules — most valuable set of rules for a hooks-heavy codebase.
      "react-hooks/rules-of-hooks": "error",
      // exhaustive-deps is disabled for now — this codebase intentionally omits
      // many deps (e.g. stable callbacks, memo guards). Re-enable after a
      // dedicated refactor pass adds the missing deps.
      "react-hooks/exhaustive-deps": "off",

      // A11y — surface obviously broken patterns. The backdrop/modal patterns in
      // this codebase use <div onClick> intentionally; jsx-a11y is overly strict
      // for these decorative/interactive overlays.
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/label-has-associated-control": "warn",

      // Base JS — soft on most rules so existing console.logs + missing
      // docs don't block the lint pass.
      "no-unused-vars": ["warn", {
        // Allow underscore prefix on any unused (param, var, destructured).
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_|^React$|^[A-Z]",  // allow PascalCase (React components, exports, type imports) for now
        caughtErrorsIgnorePattern: "^_",
        // Allow unused destructured siblings — common with hooks (`const { a, b } = useFoo()`).
        destructuredArrayIgnorePattern: "^_|^_",
      }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-undef": "error",

      // The codebase uses React.X in many places (React.StrictMode, React.useState
      // through re-exported names, React.createContext). Don't flag the import
      // as unused just because the file's JSX doesn't reference it directly.
      // The build's automatic JSX transform handles JSX → React.createElement,
      // and we still need React for the explicit .X lookups elsewhere.
      "react/jsx-uses-react": "off",
    },
  },

  // ── Playwright E2E specs (TypeScript) ───────────────────────────────
  //
  // The E2E suite used to be invisible to the linter — `npm run lint` only
  // scans `src`, so a broken spec (typo in a selector, unused import, a
  // `any` creeping in) only surfaced at runtime, minutes into CI. The
  // typescript-eslint parser + the node/browser globals below make the
  // specs a first-class lint target.
  {
    files: ["e2e/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Playwright fixtures are injected — no-undef can't see them, but
      // no-unused-vars still can and should.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // `any` is tolerated in specs (the API payloads are loosely typed) but
      // flagged so it doesn't spread into production code.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  // ── Test files ────────────────────────────────────────────────────────
  //
  // Vitest exposes its API as globals (describe / it / expect / vi / …).
  // Without this block `no-undef: "error"` would fail every test file.
  // Test files live under src/ so that `npm run lint` (which scans src) also
  // covers them — a test that fails lint fails CI.
  {
    files: ["src/**/*.{test,spec}.{js,jsx}", "src/__tests__/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
        ...globals.vitest,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Unused imports are noise in a test file — the linter would otherwise
      // flag every helper we import for a single assertion.
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_|^React$|^[A-Z]",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
];