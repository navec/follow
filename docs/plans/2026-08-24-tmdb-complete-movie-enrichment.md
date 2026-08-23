# Complete TMDB Movie Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the normalized TMDB movie status, all usable translations, the complete returned poster/backdrop gallery, and every cast member with character and optional profile image.

**Architecture:** Keep the existing single targeted movie request and extend it with `images` plus the image-language filter. Expand the provider-neutral aggregate with optional status, localized images, and cast profile images, then persist those additions through the existing source-identity and transaction-locking mechanisms.

**Tech Stack:** TypeScript, PostgreSQL, `pg`, Express bootstrap composition, Vitest.

---

### Task 1: Request the complete TMDB movie payload

**Files:**
- Modify: `src/modules/media/adapters/out/tmdb/tmdb-http.client.spec.ts`
- Modify: `src/modules/media/adapters/out/tmdb/tmdb-http.client.ts`

**Step 1: Write the failing request test**

Update the targeted movie client expectation so the requested URL contains:

```text
language=fr-FR
region=FR
append_to_response=translations,credits,images
include_image_language=fr,en,null
```

Extend the response fixture types with the root `status`, localized root fields, appended gallery entries, and cast `profile_path`.

**Step 2: Run the client spec and verify RED**

Run:

```bash
npx vitest run src/modules/media/adapters/out/tmdb/tmdb-http.client.spec.ts
```

Expected: FAIL because the request still appends only `translations,credits` and omits `include_image_language`.

**Step 3: Implement the minimal request change**

For targeted movies, set:

```ts
url.searchParams.set("append_to_response", "translations,credits,images");
url.searchParams.set("include_image_language", "fr,en,null");
```

Keep TV and feed behavior unchanged. Add TypeScript payload fields required by the provider:

```ts
status?: string;
title?: string;
overview?: string;
tagline?: string;
images?: {
  posters: Array<{ file_path: string; iso_639_1: string | null }>;
  backdrops: Array<{ file_path: string; iso_639_1: string | null }>;
};
// credits.cast item
profile_path?: string | null;
```

**Step 4: Run the client spec and verify GREEN**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit the isolated client change**

```bash
git commit -m "feat(media): request complete TMDB movie payload" -- \
  src/modules/media/adapters/out/tmdb/tmdb-http.client.ts \
  src/modules/media/adapters/out/tmdb/tmdb-http.client.spec.ts
```

### Task 2: Normalize status, translations, galleries, and cast

**Files:**
- Modify: `src/modules/media/domain/models/normalized-work-aggregate.ts`
- Modify: `src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.spec.ts`
- Modify: `src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.ts`
- Modify: `src/bootstrap/container.ts`
- Modify: `src/bootstrap/container.spec.ts`

**Step 1: Add failing provider tests for status and translations**

Use a compact fixture shaped like the supplied Fight Club response:

```ts
{
  status: "Released",
  title: "Fight Club",
  original_title: "Fight Club",
  original_language: "en",
  translations: {
    translations: [
      {
        iso_639_1: "fr",
        iso_3166_1: "FR",
        data: { title: "", overview: "Synopsis français", tagline: "Règle un" },
      },
      {
        iso_639_1: "en",
        iso_3166_1: "US",
        data: { title: "", overview: "English overview", tagline: "Soap." },
      },
      {
        iso_639_1: "es",
        iso_3166_1: "ES",
        data: { title: "El club de la lucha", overview: "Resumen" },
      },
    ],
  },
}
```

Assert:

```ts
work.statusCode === "released"
translations contain fr-FR with title from root title
translations contain en-US with title from original_title
translations contain es-ES with data.title
```

Also test `Post Production` to `post_production` and ensure a title-less unrelated translation is skipped.

**Step 2: Run the provider spec and verify RED**

```bash
npx vitest run src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.spec.ts
```

Expected: FAIL because status is absent and title-less translations are discarded.

**Step 3: Add failing gallery and cast tests**

Provide multiple posters/backdrops, including duplicate paths and `iso_639_1` values `fr`, `en`, and `null`. Provide multiple cast members with character names, one profile path, one null profile path, and a crew director.

Assert:

```ts
images include every unique returned gallery path
fr maps to fr-FR
en maps to en-US
null produces no localeCode
every cast item becomes role actor
profile_path becomes a profileImage
crew produces no contributor
```

**Step 4: Run the provider spec and verify the new RED failures**

Run the command from Step 2. Expected: FAIL on gallery size, image locale, profile image, and crew exclusion.

**Step 5: Extend the normalized aggregate**

Use these provider-neutral shapes:

```ts
export interface NormalizedWorkImage {
  type: "poster" | "backdrop" | "profile";
  sourceValue: string;
  url: string;
  localeCode?: string;
  language?: string;
}

export interface NormalizedWorkContributor {
  sourceValue: string;
  name: string;
  role: "actor";
  characterName?: string;
  profileImage?: NormalizedWorkImage;
}

work: {
  type: string;
  releaseDate?: string;
  originalTitle?: string;
  originalLanguage?: string;
  statusCode?: string;
};
```

**Step 6: Implement minimal provider normalization**

- Pass `{ defaultLocale: env.TMDB_DEFAULT_LANGUAGE }` to the provider from Bootstrap.
- Normalize status with trim, lowercase, non-alphanumeric collapse to `_`, and edge underscore removal.
- Iterate all translation entries.
- Use `data.title` first, root `title` only for the requested locale, and `original_title` only when `iso_639_1 === original_language`.
- Preserve summary/tagline from the translation entry.
- Iterate appended posters/backdrops, deduplicating by `file_path`.
- Map `fr` to `fr-FR`, `en` to `en-US`, and omit locale fields for null.
- Map only `credits.cast`; attach a `profile` image when `profile_path` is non-null.

**Step 7: Run provider and Bootstrap tests GREEN**

```bash
npx vitest run \
  src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.spec.ts \
  src/bootstrap/container.spec.ts
```

Expected: PASS.

**Step 8: Commit normalized mapping changes**

```bash
git commit -m "feat(media): normalize complete TMDB movie metadata" -- \
  src/modules/media/domain/models/normalized-work-aggregate.ts \
  src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.ts \
  src/modules/media/adapters/out/tmdb/tmdb-media-sync.provider.spec.ts \
  src/bootstrap/container.ts \
  src/bootstrap/container.spec.ts
```

### Task 3: Persist work status and localized gallery images

**Files:**
- Modify: `src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts`
- Modify: `src/modules/media/adapters/out/postgres/pg-media-sync.repository.ts`

**Step 1: Add a failing repository status test**

Persist an aggregate with `work.statusCode = "released"`. Assert the query flow:

```sql
INSERT INTO statuses (code) VALUES ($1) ON CONFLICT (code) DO NOTHING
SELECT id FROM statuses WHERE code = $1
```

Assert both work insert and update assign the resolved `status_id` without clearing an existing status when the aggregate omits it.

**Step 2: Run the repository spec and verify RED**

```bash
npx vitest run src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts
```

Expected: FAIL because statuses are never resolved and work SQL omits `status_id`.

**Step 3: Implement minimal status persistence**

Resolve `statusCode` inside the transaction before creating/updating the work. Add nullable status ID to `INSERT INTO works`; use `COALESCE($status, status_id)` on update.

**Step 4: Run the repository spec and verify GREEN for status**

Run the command from Step 2. Expected: the new status test passes.

**Step 5: Add failing localized gallery tests**

Persist images with `fr-FR`, `en-US`, and no locale. Assert locale identities are inserted before images and image insert/update SQL writes `locale_code`. Assert profile images are not linked to `work_images` in this task.

**Step 6: Run the repository spec and verify RED for image locales**

Expected: FAIL because `images.locale_code` is not written.

**Step 7: Implement localized image persistence**

Extract a reusable source-image resolver that:

1. upserts the locale identity when an image has locale metadata;
2. resolves by `(source_id, source_value)`;
3. inserts or updates `type`, `url`, and `locale_code`;
4. returns the image ID.

Keep `syncImages` responsible only for calling the resolver and linking gallery images to `work_images`.

**Step 8: Run repository tests GREEN**

Run the command from Step 2. Expected: PASS.

**Step 9: Commit status and gallery persistence**

```bash
git commit -m "feat(media): persist TMDB status and localized galleries" -- \
  src/modules/media/adapters/out/postgres/pg-media-sync.repository.ts \
  src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts
```

### Task 4: Persist cast profile images

**Files:**
- Modify: `src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts`
- Modify: `src/modules/media/adapters/out/postgres/pg-media-sync.repository.ts`

**Step 1: Add the failing profile-link test**

Persist two actors, one with a profile image and one without. Assert:

```sql
INSERT INTO contributor_images (contributor_id, image_id)
VALUES ($1, $2)
ON CONFLICT (contributor_id, image_id) DO NOTHING
```

Assert the profile path participates in sorted image identity locks and that repeated synchronization reuses the same source image.

**Step 2: Run the repository spec and verify RED**

```bash
npx vitest run src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts
```

Expected: FAIL because contributor profiles are not resolved or linked.

**Step 3: Implement minimal profile persistence**

- Include contributor `profileImage.sourceValue` values in deterministic image lock acquisition.
- In `syncContributors`, call the reusable source-image resolver after resolving the contributor.
- Link the returned image ID through `contributor_images`.
- Do not link profile images through `work_images`.

**Step 4: Run repository tests GREEN**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit cast profile persistence**

```bash
git commit -m "feat(media): persist TMDB cast profile images" -- \
  src/modules/media/adapters/out/postgres/pg-media-sync.repository.ts \
  src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts
```

### Task 5: Verify the complete PostgreSQL flow

**Files:**
- Modify: `tests/integration/media/pg-media-sync.repository.integration.spec.ts`

**Step 1: Extend the integration fixture and assertions**

Add to the complete aggregate:

```ts
work: { statusCode: "released", /* existing fields */ }
images: [
  { type: "poster", localeCode: "fr-FR", language: "fr", /* ... */ },
  { type: "poster", localeCode: "en-US", language: "en", /* ... */ },
  { type: "backdrop", /* null locale represented by absence */ /* ... */ },
]
contributors: [
  {
    role: "actor",
    characterName: "Tyler Durden",
    profileImage: { type: "profile", /* ... */ },
    /* ... */
  },
]
```

Assert:

- `works.status_id` joins to `statuses.code = 'released'`;
- all translations exist;
- localized and null-locale gallery images exist;
- every contributor is an actor with its character;
- profile images link through `contributor_images` but not `work_images`;
- repeat synchronization keeps stable row counts and updates mutable metadata.

**Step 2: Run the integration test and verify RED**

```bash
npx vitest run tests/integration/media/pg-media-sync.repository.integration.spec.ts --maxWorkers=1
```

Expected: FAIL until all new persistence behavior is connected.

**Step 3: Make only fixture/query corrections needed for the intended behavior**

Do not add production behavior in this step. Correct test setup only if the RED run reveals fixture or assertion mistakes.

**Step 4: Run the integration test GREEN**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit the integration coverage**

```bash
git commit -m "test(media): cover complete TMDB movie persistence" -- \
  tests/integration/media/pg-media-sync.repository.integration.spec.ts
```

### Task 6: End-to-end verification and live resynchronization

**Files:**
- Modify if necessary: `.env.example`
- Modify if necessary: `README.md`

**Step 1: Run focused tests**

```bash
npx vitest run \
  src/modules/media/adapters/out/tmdb \
  src/modules/media/adapters/out/postgres/pg-media-sync.repository.spec.ts \
  src/platform/database/pg-transaction.spec.ts \
  src/bootstrap/container.spec.ts
```

Expected: PASS.

**Step 2: Run PostgreSQL integration**

```bash
npm run test:integration
```

Expected: PASS.

**Step 3: Run static and build checks**

```bash
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

**Step 4: Run the available full suite**

```bash
npm test
```

Expected: PASS outside restricted local-listener sandboxes. If the environment blocks Supertest or PostgreSQL sockets, record that environmental limitation and rely on the Docker CI target.

**Step 5: Run the Docker CI target**

```bash
make ci-ready-fast
```

Expected: PASS.

**Step 6: Resynchronize Fight Club through the real application**

Call the existing protected `POST /media/sync` endpoint with TMDB movie ID `550`. Query only the relevant joined rows and verify:

- status is `released`;
- `work_i18n` contains FR, EN, and other titled translations;
- every returned gallery path is stored with correct nullable locale;
- all cast credits are actors with characters;
- available cast profiles are linked.

Do not delete the existing row manually; the resynchronization must prove update/idempotency behavior.

**Step 7: Review repository state**

```bash
git status --short
git diff --cached --stat
git log -6 --oneline
```

Confirm unrelated staged Auth changes remain preserved and no secret or captured TMDB payload is committed.
