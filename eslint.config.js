import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", ".output", ".vinxi", "src/integrations/supabase/types.backup.ts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Hooks 7 adds React Compiler diagnostics. The application is not
      // compiled with React Compiler yet, so keep the established runtime
      // Hooks rules without treating compiler opt-in guidance as violations.
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // Keep ESLint focused on code correctness. Formatting is handled by the
    // dedicated Prettier command; enforcing it here makes the untouched CRLF
    // legacy tree fail before semantic rules can run.
    rules: {
      "prettier/prettier": "off",
    },
  },
  {
    files: ["src/components/ui/chart.tsx"],
    rules: {
      // This pre-existing shadcn/Recharts adapter intentionally shields API
      // drift between the installed Recharts and React type packages.
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
);
