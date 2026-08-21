# Absolute Import Aliases Design

**Status:** Approved on 2026-08-21

## Objective

Replace every relative module specifier in `src`, `tests`, and `scripts` with an
absolute TypeScript alias. This includes same-directory imports such as
`./file.js`, parent imports such as `../../file.js`, and relative re-exports.

The refactor must preserve runtime behavior, module boundaries, NodeNext `.js`
suffixes, and the user's already-staged alias migration changes.

## Alias scheme

Use one alias per architectural or tooling root:

```json
{
  "@auth/*": ["src/modules/auth/*"],
  "@media/*": ["src/modules/media/*"],
  "@shared/*": ["src/shared/*"],
  "@platform/*": ["src/platform/*"],
  "@bootstrap/*": ["src/bootstrap/*"],
  "@tests/*": ["tests/*"],
  "@scripts/*": ["scripts/*"]
}
```

Aliases continue to reference emitted `.js` module specifiers under NodeNext.
`tsc-alias` rewrites build output, while Vitest and `tsx` resolve the same
TypeScript paths during tests and script execution.

## Import policy

All static imports and re-exports in `src`, `tests`, and `scripts` use these
aliases. Package imports such as `express`, `vitest`, and `node:*` remain
unchanged.

ESLint rejects `./*` and `../*` module specifiers in the selected directories.
The rule is composed with the existing Express restriction: non-HTTP module
files reject both Express and relative imports, while module HTTP entrypoints
may import Express but still reject relative imports.

The aliases do not weaken architecture rules. ESLint Boundaries continues to
resolve TypeScript paths and enforce ownership between Auth, Media, Shared,
Platform, and Bootstrap.

## Migration scope

The migration is mechanical and behavior-preserving:

1. Complete the alias definitions for `tests` and `scripts`.
2. Update ESLint import ordering and add the no-relative-import rule.
3. Convert every import and re-export in `src`, `tests`, and `scripts`.
4. Keep all existing staged edits intact, including formatting already applied
   alongside the initial Media alias migration.
5. Confirm no selected file contains a relative module specifier.

## Verification

Use a temporary relative-import fixture to observe ESLint RED before enabling
the rule, then verify GREEN after the rule and migration.

Final verification includes:

- absence of relative imports and re-exports in `src`, `tests`, and `scripts`;
- ESLint;
- strict TypeScript typecheck;
- production build and emitted-alias rewriting;
- unit, adapters/entrypoints, PostgreSQL integration, and complete test suites;
- `git diff --check` and review of the pre-existing staged changes.
