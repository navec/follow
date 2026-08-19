import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", ".worktrees/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      boundaries,
      "simple-import-sort": simpleImportSort,
    },
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ],
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always"],
      "no-implicit-coercion": "error",
      "simple-import-sort/imports": ["error", {
        groups: [
          ["^node:"],
          ["^\\u0000"],
          ["^@?\\w"],
          ["^@auth", "^@media", "^@platform/", "^@bootstrap/"],
          ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
          ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"]
        ]
      }],
      "simple-import-sort/exports": "error"
    }
  },
  {
    files: ["src/**/*.ts"],
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "./tsconfig.build.json"]
        }
      },
      "boundaries/elements": [
        { type: "auth-composition", pattern: "src/modules/auth/auth.module.ts", mode: "full" },
        { type: "auth-composition", pattern: "src/modules/auth/auth.module.spec.ts", mode: "full" },
        { type: "auth-http-entrypoint", pattern: "src/modules/auth/entrypoints/http/**/*.ts", mode: "full" },
        { type: "auth-public", pattern: "src/modules/auth/public/**/*.ts", mode: "full" },
        { type: "auth-internal", pattern: "src/modules/auth/**/*.ts", mode: "full" },
        { type: "media-composition", pattern: "src/modules/media/media.module.ts", mode: "full" },
        { type: "media-composition", pattern: "src/modules/media/media.module.spec.ts", mode: "full" },
        { type: "media-http-entrypoint", pattern: "src/modules/media/entrypoints/http/**/*.ts", mode: "full" },
        { type: "media-scheduler-entrypoint", pattern: "src/modules/media/entrypoints/scheduler/**/*.ts", mode: "full" },
        { type: "media-public", pattern: "src/modules/media/public/**/*.ts", mode: "full" },
        { type: "media-internal", pattern: "src/modules/media/**/*.ts", mode: "full" },
        { type: "shared-http", pattern: "src/shared/http/**/*.ts", mode: "full" },
        { type: "shared-scheduling", pattern: "src/shared/scheduling/**/*.ts", mode: "full" },
        { type: "platform", pattern: "src/platform/**/*.ts", mode: "full" },
        { type: "bootstrap", pattern: "src/bootstrap/**/*.ts", mode: "full" }
      ]
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown": "error",
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "auth-composition", allow: ["auth-composition", "auth-internal", "auth-http-entrypoint", "auth-public", "platform", "shared-http"] },
          { from: "auth-http-entrypoint", allow: ["auth-http-entrypoint", "auth-public", "shared-http"] },
          { from: "auth-public", allow: ["auth-public"] },
          { from: "auth-internal", allow: ["auth-composition", "auth-internal", "auth-public", "platform"] },
          { from: "media-composition", allow: ["media-composition", "media-internal", "media-http-entrypoint", "media-scheduler-entrypoint", "media-public", "platform", "shared-http", "shared-scheduling"] },
          { from: "media-http-entrypoint", allow: ["media-http-entrypoint", "media-public", "shared-http"] },
          { from: "media-scheduler-entrypoint", allow: ["media-scheduler-entrypoint", "media-public", "shared-scheduling"] },
          { from: "media-public", allow: ["media-public"] },
          { from: "media-internal", allow: ["media-composition", "media-internal", "media-public", "platform"] },
          { from: "shared-http", allow: ["shared-http"] },
          { from: "shared-scheduling", allow: ["shared-scheduling"] },
          { from: "platform", allow: ["platform"] },
          { from: "bootstrap", allow: ["bootstrap", "auth-composition", "auth-internal", "auth-public", "media-composition", "media-internal", "media-public", "platform", "shared-http", "shared-scheduling"] }
        ]
      }]
    }
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly"
      }
    }
  }
);
