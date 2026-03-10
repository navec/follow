# Media Sync Design

## Goal

Add a shared media synchronization flow that imports data from TMDB and MangaDex into the local Postgres database, with two trigger modes:

- scheduled catalog synchronization via `node-cron`
- targeted synchronization via REST, restricted to authorized administrators

## Context

The current codebase already has:

- a strict hexagonal structure with `domain`, `application`, `infrastructure`, and `bootstrap`
- JWT authentication and authenticated route middleware
- a Postgres schema for media reference data, including `works`, `source_works`, `work_i18n`, `contributors`, `episodes`, and `images`

The codebase does not yet have:

- a `media` application module
- provider adapters for TMDB or MangaDex
- role/permission-based authorization
- scheduling infrastructure

## Scope

This design covers:

- a shared synchronization use case used by both REST and cron
- provider adapters for TMDB and MangaDex
- selective upsert rules into the existing media schema
- REST authorization based on `admin` role and `media:write` permission
- cron-triggered feed synchronization

This design does not cover:

- async job queues
- background worker persistence
- user-facing media browsing endpoints
- local editorial fields beyond preserving them from overwrite

## High-Level Architecture

The synchronization flow will be exposed through one application entry point that accepts a provider and provider-specific parameters:

```ts
type SyncRequest =
  | {
      provider: "tmdb" | "mangadex";
      params: {
        target: "work";
        externalId: string | number;
        type: string;
      };
    }
  | {
      provider: "tmdb" | "mangadex";
      params: {
        target: "feed";
        feed: string;
      };
    };
```

Both REST and cron construct a `SyncRequest` and call the same application use case. The use case delegates external reads to a provider adapter, normalizes provider payloads into a shared internal aggregate, and persists them through repository ports.

### Layers

- `src/domain/media`
  - synchronization concepts and authorization value objects if needed
- `src/application/media`
  - sync request DTOs
  - sync use cases
  - ports for providers and repositories
- `src/infrastructure/providers`
  - TMDB adapter
  - MangaDex adapter
- `src/infrastructure/persistence/postgres/repositories`
  - media sync repository/upsert implementation
- `src/infrastructure/http/express`
  - admin-protected sync controller and routes
- `src/infrastructure/scheduling`
  - `node-cron` registration and job execution

## Trigger Model

### REST

- Endpoint: `POST /media/sync`
- No `auth` segment in the path
- Access is enforced by middleware and use-case authorization checks, not by the route name
- Intended for targeted imports and optional manual feed execution

### Cron

- Runs provider feed imports from configuration
- Uses the same use case and provider registry as REST
- Does not own synchronization logic

## Authorization Model

Targeted synchronization via REST requires:

- a valid JWT-authenticated user
- user role `admin`
- explicit permission `media:write`

The authorization rule should be reusable and independent of HTTP so that the same guard can be tested at the application layer.

Recommended user capability model:

- `role`: coarse-grained access, starting with `user` and `admin`
- `permissions`: fine-grained rights, including `media:write`

This keeps future admin endpoints from depending on role checks alone.

## Provider Contract

Each provider adapter implements one shared port, for example:

```ts
interface MediaSyncProviderPort {
  supports(provider: SyncRequest["provider"]): boolean;
  fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>>;
}
```

Provider adapters are responsible for:

- validating provider-specific request constraints
- calling the external API
- mapping the payload to the normalized internal aggregate

The application layer should not contain TMDB or MangaDex response details.

## Normalized Aggregate

Each provider returns one or more `NormalizedWorkAggregate` values. The aggregate should contain only data needed to populate the current schema:

- work metadata
  - source identities
  - work type
  - release date
  - provider-derived status
- localized work content
  - locale
  - title
  - summary
- contributors
  - source identities when available
  - contributor name
  - optional birth date
  - contributor roles on the work
- episodes or provider-equivalent units when relevant
  - season/episode numbering where meaningful
  - localized titles and summaries
- images
  - source identities
  - type
  - url
  - locale where available

The aggregate is intentionally provider-neutral so the repository can persist one internal shape regardless of source.

## Persistence and Identity Rules

### Identity resolution

Identity resolution should be based on the source mapping tables first:

- works: `source_works(source_id, source_value)`
- images: `source_images(source_id, source_value)`

If the same internal work is linked to multiple providers, the system keeps:

- one row in `works`
- multiple rows in `source_works`

### Upsert policy

The persistence strategy is selective upsert, not blind replacement.

Allowed provider-managed updates:

- `works`
  - `type`
  - `release_date`
  - `status_id`
- `work_i18n`
- `episode_i18n`
- provider-managed image and contributor associations

Protected local data:

- future local-only editorial fields must not be overwritten
- user activity and preferences are never part of synchronization

### REST targeted sync

- upsert only
- no destructive cleanup beyond recreable scoped associations when necessary

### Cron feed sync

- same upsert behavior per synchronized work
- cleanup is limited to associations that are fully provider-derived and only inside the specific synchronized work scope

This preserves idempotency and reduces accidental data loss.

## Error Handling and Observability

The synchronization use case should return a structured result such as:

```ts
type SyncResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: ReadonlyArray<{
    code: string;
    message: string;
    target?: string;
  }>;
};
```

Errors should be classified into:

- request validation errors
- authorization errors
- provider errors
- persistence errors

Operational requirements:

- log provider, request target, duration, and outcome
- isolate cron job failures so one provider or feed failure does not stop other jobs
- keep the flow idempotent so retries are safe

## Testing Strategy

### Unit tests

- sync request validation
- authorization rules for `admin` + `media:write`
- provider registry selection
- orchestration of the synchronization use case
- provider mapping from TMDB and MangaDex payloads to normalized aggregates
- selective upsert behavior in repository logic

### Integration tests

- `POST /media/sync` authorization and validation
- successful targeted sync persistence into Postgres
- cron handler invocation without waiting for real time
- end-to-end persistence of normalized data into media tables

## Recommended Initial Delivery

Deliver the feature in incremental slices:

1. authorization model for role and permission
2. application sync contract and shared use case
3. Postgres repository for selective upsert
4. REST targeted sync endpoint
5. cron feed execution
6. second provider after the first adapter path is stable

This keeps the first shipped slice useful while reducing integration risk.
