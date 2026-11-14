// Lint config for backend/, admin/, desktop/, extension/ and firefox-extension/.
// web/ has its own Next.js config and is linted from inside web/.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.build/**",
      "web/**",
      "macos/**",
      "macos-sdk/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.jest, ...globals.webextensions },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["extension/**/*.tsx", "firefox-extension/**/*.tsx", "desktop/renderer/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Untyped JSON/LLM payloads still pass through `any` in places; keep it visible.
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  {
    // Hand-written Supabase schema: `{}` is the conventional "no columns" shape.
    files: ["admin/src/config/db.types.ts"],
    rules: { "@typescript-eslint/no-empty-object-type": "off" },
  },
  {
    files: ["**/tests/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // jest.isolateModules() + require() is how env-dependent modules are re-loaded.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // k6 load-test scripts run in k6's runtime, not Node.
    files: ["backend/load/**"],
    languageOptions: { globals: { __ENV: "readonly", __VU: "readonly", __ITER: "readonly" } },
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
