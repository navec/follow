# Complete TMDB Movie Enrichment Design

## Goal

Complete targeted TMDB movie synchronization so the catalog persists the movie status, usable localized metadata, the complete returned poster/backdrop gallery, and every cast member with character and profile image.

## Scope

This increment applies to targeted TMDB `movie` synchronization. It extends the existing movie enrichment without hydrating popular-feed items or TV works.

Included:

- normalized TMDB movie status;
- every usable entry from `translations.translations`;
- every poster and backdrop returned by the appended `images` response;
- every member of `credits.cast`, including character name and optional profile image;
- idempotent PostgreSQL persistence for statuses, localized work metadata, images, contributors, and their links.

Excluded:

- `credits.crew`, including directors;
- production companies, genres, countries, budgets, ratings, videos, and collections;
- destructive removal of records absent from a later TMDB response;
- feed and TV hydration.

## TMDB request

Targeted movies use one enriched request:

```text
GET /movie/{id}?language=fr-FR&append_to_response=translations,credits,images&include_image_language=fr,en,null
```

The configured language remains the preferred localized response language. The appended resources avoid additional round trips and expose the source language for gallery images.

## Normalization

TMDB status values are trimmed and normalized to lowercase snake case before persistence, for example `Released` becomes `released` and `Post Production` becomes `post_production`.

Every translation with a usable title is emitted. When TMDB returns an empty translated title:

- the requested locale uses the localized root `title`;
- a translation matching `original_language` uses `original_title`;
- other title-less translations are skipped, because borrowing a title from another locale would corrupt localized data.

Locale codes combine the TMDB language and country codes, such as `fr-FR` and `en-US`.

All returned posters and backdrops are emitted and deduplicated by `file_path`. Image language maps to the configured supported locale (`fr` to `fr-FR`, `en` to `en-US`); TMDB `null` remains a null database locale. The primary paths are naturally included when present in the gallery.

Every cast member becomes an `actor` contributor with its TMDB person ID and optional character name. A non-null `profile_path` becomes a `profile` image linked through `contributor_images`. Crew entries are ignored.

## Persistence

The normalized aggregate gains an optional work status code, optional image locale, and optional contributor profile image.

Within the existing per-work transaction, persistence:

1. resolves or inserts the normalized status and assigns `works.status_id`;
2. upserts locale identities and `work_i18n` rows;
3. resolves gallery images through `(source_id, source_value)`, updates metadata, and links them through `work_images`;
4. resolves cast identities, upserts actor credits, resolves profile images through the same source identity mechanism, and links them through `contributor_images`.

Locks for work, contributor, and image source identities remain deterministic. Profile image paths participate in image locking and deduplication. A later synchronization updates received rows but does not delete previously stored rows.

## Error handling

Missing optional translations, image locales, gallery entries, character names, or profile paths do not fail the movie. Persistence failures roll back the affected movie transaction and return the existing `PERSISTENCE_ERROR` while other batch items continue.

## Tests

- HTTP client test asserts the complete append and image-language query.
- Provider tests use the observed Fight Club payload shape, including empty FR/EN translation titles and their valid fallbacks.
- Provider tests cover all returned gallery images, null image language, all cast members, profiles, status normalization, and exclusion of crew.
- Repository tests cover status resolution, localized image persistence, contributor profile linking, deterministic locks, and idempotency.
- PostgreSQL integration verifies the complete aggregate and a repeat synchronization.
- Typecheck, lint, build, focused tests, and the available full suite complete verification.
