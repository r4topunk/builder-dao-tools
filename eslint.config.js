import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  // Deliberately no `js.configs.recommended`: `no-undef` misfires on Node globals
  // without a type-aware/env setup, and TS already catches undefined identifiers.
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_`-prefixed identifiers are intentionally unused (e.g. a param kept for
      // signature symmetry across tool handlers).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  }
);
