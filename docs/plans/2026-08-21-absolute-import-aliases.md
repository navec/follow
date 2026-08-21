# Absolute Import Aliases Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every relative import and re-export in `src`, `tests`, and `scripts` with an architecture-owned absolute alias and prevent regressions with ESLint.

**Architecture:** Keep one alias per bounded source root (`@auth`, `@media`, `@shared`, `@platform`, `@bootstrap`) and add tooling roots (`@tests`, `@scripts`). TypeScript paths remain the source of truth for Vitest, `tsx`, and `tsc-alias`; ESLint resolves the same aliases for Boundaries and rejects all relative module specifiers in the selected directories.

**Tech Stack:** Node.js 24, TypeScript NodeNext, Vitest, vite-tsconfig-paths, ESLint flat config, eslint-plugin-boundaries, tsc-alias

---

## Preconditions

- Work on `modular-architecture` in `/Users/navec/Projects/follow`.
- Preserve the existing staged changes in `tsconfig.json`, `eslint.config.js`, and Media files; they are the user's initial alias migration and belong in Task 1.
- Keep `.js` on every internal module specifier.
- Load `/Users/navec/Projects/follow/.env` without displaying or copying it before PostgreSQL tests.
- Follow `superpowers:test-driven-development` for the ESLint policy change and `superpowers:verification-before-completion` before each commit.

### Task 1: Complete the Media alias migration and canonical source aliases

**Files:**
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: every TypeScript file under `src/modules/media` that still contains `from "./` or `from "../`
- Preserve and include: all currently staged Media alias and formatting changes

**Step 1: Record the failing invariant**

Run:

```bash
rg -n 'from "\.\.?/' src/modules/media --glob '*.ts'
```

Expected: matches remain in the Media composition root, public index, entrypoints, specs, and adjacent adapter tests.

**Step 2: Complete the canonical aliases**

Keep these source aliases in `tsconfig.json`:

```json
"@auth/*": ["src/modules/auth/*"],
"@media/*": ["src/modules/media/*"],
"@shared/*": ["src/shared/*"],
"@platform/*": ["src/platform/*"],
"@bootstrap/*": ["src/bootstrap/*"]
```

Keep the alias import-order group in `eslint.config.js` synchronized with those names.

**Step 3: Replace all Media-relative specifiers**

Use `@media/*` for every same-module import and `@shared/*` for shared contracts. This includes `./media.module.js`, adjacent implementation imports in specs, public re-exports, HTTP handlers, and scheduled jobs.

Do not change behavior or remove the user's staged formatting changes.

**Step 4: Verify Media GREEN**

Run:

```bash
test -z "$(rg -n 'from "\.\.?/' src/modules/media --glob '*.ts')"
npx vitest run src/modules/media
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: no Media-relative specifier and every command exits 0.

**Step 5: Commit**

```bash
git add tsconfig.json eslint.config.js src/modules/media
git commit -m "refactor(media): use absolute import aliases"
```

### Task 2: Migrate Auth imports and re-exports

**Files:**
- Modify: every TypeScript file under `src/modules/auth` that contains a relative import or re-export

**Step 1: Verify RED**

Run:

```bash
rg -n 'from "\.\.?/' src/modules/auth --glob '*.ts'
```

Expected: matches show the remaining Auth-relative specifiers.

**Step 2: Replace Auth-relative specifiers**

Use `@auth/*` for Auth-owned types, implementations, specs, and public re-exports. Use `@shared/*` from the Auth composition root and HTTP entrypoint. Preserve `.js` suffixes.

**Step 3: Verify GREEN**

Run:

```bash
test -z "$(rg -n 'from "\.\.?/' src/modules/auth --glob '*.ts')"
npx vitest run src/modules/auth
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: no Auth-relative specifier and every command exits 0.

**Step 4: Commit**

```bash
git add src/modules/auth
git commit -m "refactor(auth): use absolute import aliases"
```

### Task 3: Migrate Shared, Platform, and Bootstrap

**Files:**
- Modify: TypeScript files containing relative specifiers under `src/shared`
- Modify: TypeScript files containing relative specifiers under `src/platform`
- Modify: TypeScript files containing relative specifiers under `src/bootstrap`

**Step 1: Verify RED**

Run:

```bash
rg -n 'from "\.\.?/' src/shared src/platform src/bootstrap --glob '*.ts'
```

Expected: matches remain in production files and co-located specs.

**Step 2: Replace the specifiers**

- Use `@shared/*` inside Shared.
- Use `@platform/*` inside Platform.
- Use `@bootstrap/*` inside Bootstrap and `@auth/*`, `@media/*`, or `@shared/*` for its dependencies.
- Convert co-located spec imports as well as production imports.

**Step 3: Verify GREEN**

Run:

```bash
test -z "$(rg -n 'from "\.\.?/' src/shared src/platform src/bootstrap --glob '*.ts')"
npx vitest run src/shared src/platform src/bootstrap
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: no relative specifier in these roots and every command exits 0.

**Step 4: Commit**

```bash
git add src/shared src/platform src/bootstrap
git commit -m "refactor(core): use absolute import aliases"
```

### Task 4: Migrate tests and scripts

**Files:**
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: `scripts/migration-status.ts`
- Modify: `tests/integration/helpers/test-app.ts`
- Modify: `tests/integration/helpers/test-db.spec.ts`
- Modify: `tests/integration/http/auth/auth.routes.integration.spec.ts`
- Modify: `tests/integration/http/media/media-sync.routes.integration.spec.ts`
- Modify: `tests/scripts/check-changed-files-coverage.spec.ts`

**Step 1: Verify RED**

Run:

```bash
rg -n 'from "\.\.?/' tests scripts --glob '*.ts' --glob '*.mjs'
```

Expected: relative helper, source, and script imports are reported.

**Step 2: Add tooling aliases**

Add to `tsconfig.json`:

```json
"@tests/*": ["tests/*"],
"@scripts/*": ["scripts/*"]
```

Add `@tests/` and `@scripts/` to the alias import-order group in `eslint.config.js`.

**Step 3: Replace test and script specifiers**

Use `@tests/*` between test helpers, `@scripts/*` for script imports, and the existing source aliases for imports from `src`. Keep `.js` or `.mjs` suffixes exactly as required by the target file.

**Step 4: Verify GREEN, including runtime resolution**

Run:

```bash
test -z "$(rg -n 'from "\.\.?/' tests scripts --glob '*.ts' --glob '*.mjs')"
npx vitest run tests/scripts tests/integration/helpers
set -a; source /Users/navec/Projects/follow/.env; set +a; npm run test:integration
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: aliases resolve in Vitest and `tsx`, integration tests pass, and no relative specifier remains.

**Step 5: Commit**

```bash
git add tsconfig.json eslint.config.js tests scripts
git commit -m "refactor(testing): use absolute import aliases"
```

### Task 5: Enforce the no-relative-import architecture rule

**Files:**
- Modify: `eslint.config.js`
- Modify: `README.md`
- Temporarily create and delete: `src/modules/auth/domain/relative-import.fixture.ts`

**Step 1: Prove the current policy is RED**

Create:

```ts
import type { Email } from "./value-objects/email.js";

export type RelativeImportFixture = Email;
```

Run:

```bash
npx eslint src/modules/auth/domain/relative-import.fixture.ts
```

Expected before the new rule: PASS, proving ESLint does not yet reject the forbidden relative specifier.

**Step 2: Add the minimal ESLint restriction**

Define a reusable restriction:

```js
const relativeImportPatterns = [{
  group: ["./*", "../*"],
  message: "Use an absolute project alias instead of a relative import."
}];
```

Apply it to `src/**/*.ts`, `tests/**/*.ts`, and `scripts/**/*.{ts,mjs}`. Compose it with the existing Express restriction for non-HTTP module files. Replace the current HTTP and test `no-restricted-imports: "off"` overrides with the relative-only restriction so they may use their intended imports but cannot use relative paths.

**Step 3: Verify the focused GREEN behavior**

Run:

```bash
npx eslint src/modules/auth/domain/relative-import.fixture.ts
```

Expected: FAIL with the absolute-alias message.

Delete the temporary fixture.

**Step 4: Document and verify the final invariant**

Add a short README note listing the seven aliases and stating that relative imports are rejected in `src`, `tests`, and `scripts`.

Run:

```bash
test -z "$(rg -n 'from "\.\.?/' src tests scripts --glob '*.ts' --glob '*.mjs')"
npm run lint
npm run typecheck
npm run test:unit
npm run test:adapters
set -a; source /Users/navec/Projects/follow/.env; set +a; npm run test:integration
set -a; source /Users/navec/Projects/follow/.env; set +a; npm test
npm run build
git diff --check
```

Expected: no relative specifier, 77 existing tests pass, and all commands exit 0.

**Step 5: Commit**

```bash
git add eslint.config.js README.md
git commit -m "build(architecture): enforce absolute imports"
```

### Task 6: Review the migration and finish the branch

**Step 1: Review architecture and staged-history integrity**

Confirm:

- all user-staged changes from before the migration were preserved in Task 1;
- alias resolution did not bypass ESLint Boundaries;
- Express remains forbidden outside module HTTP entrypoints;
- no relative import or re-export remains in scope;
- emitted `dist` imports are valid after `tsc-alias`.

**Step 2: Request review**

Use `superpowers:requesting-code-review` for the complete migration range. Address validated feedback with `superpowers:receiving-code-review`.

**Step 3: Re-run full verification**

Repeat the complete Task 5 verification suite after review changes.

**Step 4: Finish**

Use `superpowers:finishing-a-development-branch` to present merge, PR, keep, or discard options.
