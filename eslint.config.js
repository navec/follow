import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
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
          ["^@src/", "^@domain/", "^@application/", "^@infrastructure/"],
          ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
          ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"]
        ]
      }],
      "simple-import-sort/exports": "error",
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["../../*", "../../../*", "../../../../*", "../../../../../*", "../../../../../../*"],
            "message": "Use aliases (@domain/@application/@infrastructure/@src) instead of deep relative imports."
          }
        ]
      }]
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
        { type: "shared", pattern: "src/shared/**/*.ts", mode: "full" },
        { type: "domain", pattern: "src/domain/**/*.ts", mode: "full" },
        { type: "application", pattern: "src/application/**/*.ts", mode: "full" },
        { type: "infrastructure", pattern: "src/infrastructure/**/*.ts", mode: "full" },
        { type: "bootstrap", pattern: "src/bootstrap/**/*.ts", mode: "full" }
      ]
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown": "error",
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "shared", allow: ["shared"] },
          { from: "domain", allow: ["domain", "shared"] },
          { from: "application", allow: ["application", "domain", "shared"] },
          { from: "infrastructure", allow: ["infrastructure", "application", "domain", "shared"] },
          { from: "bootstrap", allow: ["bootstrap", "infrastructure", "application", "domain", "shared"] }
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
