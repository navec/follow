# Media Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a shared media synchronization flow for TMDB and MangaDex with REST-triggered targeted imports, cron-triggered feed imports, and admin write authorization.

**Architecture:** Add a new `media` application slice in the existing hexagonal structure. REST and cron both submit a shared `SyncRequest` to one orchestration use case, which delegates to provider adapters and a Postgres sync repository that performs selective idempotent upserts.

**Tech Stack:** Node 24, TypeScript, Express, Zod, pg, node-cron, Vitest

---

### Task 1: Add authorization tests for roles and permissions

**Files:**
- Create: `/Users/navec/Projects/follow/src/domain/auth/value-objects/permission.ts`
- Create: `/Users/navec/Projects/follow/src/domain/auth/value-objects/role.ts`
- Modify: `/Users/navec/Projects/follow/src/domain/auth/entities/user.ts`
- Create: `/Users/navec/Projects/follow/src/application/auth/services/authorization.service.spec.ts`
- Create: `/Users/navec/Projects/follow/src/application/auth/services/authorization.service.ts`

**Step 1: Write the failing tests**

```ts
it("allows media sync for admin users with media:write", () => {
  expect(service.canWriteMedia(adminUser)).toBe(true);
});

it("rejects media sync when permission is missing", () => {
  expect(service.canWriteMedia(adminWithoutPermission)).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/application/auth/services/authorization.service.spec.ts`
Expected: FAIL because authorization service and permission model do not exist.

**Step 3: Write minimal implementation**

```ts
export class AuthorizationService {
  canWriteMedia(user: User): boolean {
    return user.role === "admin" && user.permissions.includes("media:write");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/application/auth/services/authorization.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/domain/auth src/application/auth/services
git commit -m "feat(auth): add media sync authorization model"
```

### Task 2: Persist roles and permissions in Postgres

**Files:**
- Create: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/migrations/<timestamp>_add_user_roles_permissions.up.sql`
- Create: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/migrations/<timestamp>_add_user_roles_permissions.down.sql`
- Create: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/migrations/<timestamp>_add_user_roles_permissions.up.js`
- Modify: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/repositories/pg-user.repository.ts`
- Modify: `/Users/navec/Projects/follow/tests/integration/helpers/test-db.ts`

**Step 1: Write the failing integration test**

```ts
it("loads role and permissions from Postgres", async () => {
  const user = await repository.findById(existingId);
  expect(user?.role).toBe("admin");
  expect(user?.permissions).toContain("media:write");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:integration -- tests/integration/http/auth/auth.routes.integration.spec.ts`
Expected: FAIL because the schema and repository mapping do not include role or permissions.

**Step 3: Write minimal implementation**

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN permissions TEXT[] NOT NULL DEFAULT '{}';
```

```ts
return {
  ...row,
  role: row.role,
  permissions: row.permissions,
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test:integration -- tests/integration/http/auth/auth.routes.integration.spec.ts`
Expected: PASS with repository mapping updated for role and permissions.

**Step 5: Commit**

```bash
git add src/infrastructure/persistence/postgres tests/integration
git commit -m "feat(auth): persist roles and permissions"
```

### Task 3: Define media sync application contracts

**Files:**
- Create: `/Users/navec/Projects/follow/src/application/media/dto/sync-request.dto.ts`
- Create: `/Users/navec/Projects/follow/src/application/media/dto/sync-result.dto.ts`
- Create: `/Users/navec/Projects/follow/src/application/media/ports/out/media-sync-provider.port.ts`
- Create: `/Users/navec/Projects/follow/src/application/media/ports/out/media-sync-repository.port.ts`
- Create: `/Users/navec/Projects/follow/src/application/media/use-cases/sync-media.use-case.spec.ts`
- Create: `/Users/navec/Projects/follow/src/application/media/use-cases/sync-media.use-case.ts`

**Step 1: Write the failing tests**

```ts
it("delegates to the matching provider and persists normalized aggregates", async () => {
  await useCase.execute(request, actor);
  expect(provider.fetch).toHaveBeenCalledWith(request);
  expect(repository.upsertMany).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/application/media/use-cases/sync-media.use-case.spec.ts`
Expected: FAIL because the media sync contracts do not exist.

**Step 3: Write minimal implementation**

```ts
export class SyncMediaUseCase {
  async execute(request: SyncRequest, actor: User): Promise<SyncResult> {
    this.assertAuthorized(actor);
    const aggregates = await this.providerRegistry.get(request.provider).fetch(request);
    return this.repository.upsertMany(aggregates);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/application/media/use-cases/sync-media.use-case.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/application/media
git commit -m "feat(media): add sync use case contracts"
```

### Task 4: Add normalized aggregate and repository upsert tests

**Files:**
- Create: `/Users/navec/Projects/follow/src/application/media/models/normalized-work-aggregate.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/repositories/pg-media-sync.repository.spec.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/repositories/pg-media-sync.repository.ts`

**Step 1: Write the failing tests**

```ts
it("upserts work and source mapping without duplicating the work", async () => {
  const result = await repository.upsertMany([aggregate]);
  expect(result.created + result.updated).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/infrastructure/persistence/postgres/repositories/pg-media-sync.repository.spec.ts`
Expected: FAIL because the repository does not exist.

**Step 3: Write minimal implementation**

```ts
await client.query("begin");
// resolve source identity, upsert work, then upsert localized data and associations
await client.query("commit");
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/infrastructure/persistence/postgres/repositories/pg-media-sync.repository.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/application/media/models src/infrastructure/persistence/postgres/repositories
git commit -m "feat(media): add postgres sync upsert repository"
```

### Task 5: Add provider adapter tests and the first provider implementation

**Files:**
- Create: `/Users/navec/Projects/follow/src/infrastructure/providers/tmdb/tmdb-media-sync.provider.spec.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/providers/tmdb/tmdb-media-sync.provider.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/providers/shared/provider-registry.ts`
- Modify: `/Users/navec/Projects/follow/package.json`

**Step 1: Write the failing tests**

```ts
it("maps a TMDB work response into a normalized aggregate", async () => {
  const result = await provider.fetch(request);
  expect(result[0].source.sourceValue).toBe("123");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/infrastructure/providers/tmdb/tmdb-media-sync.provider.spec.ts`
Expected: FAIL because the TMDB provider does not exist.

**Step 3: Write minimal implementation**

```ts
export class TmdbMediaSyncProvider {
  async fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    const payload = await this.client.getWork(request);
    return [mapTmdbPayload(payload)];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/infrastructure/providers/tmdb/tmdb-media-sync.provider.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/providers package.json
git commit -m "feat(media): add tmdb sync provider"
```

### Task 6: Add REST sync endpoint with admin authorization

**Files:**
- Create: `/Users/navec/Projects/follow/src/infrastructure/http/express/controllers/media-sync.controller.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/http/express/routes/media.routes.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/http/express/validation/schemas/media-sync.schemas.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/http/express/middleware/require-permission.ts`
- Modify: `/Users/navec/Projects/follow/src/infrastructure/http/express/app.ts`
- Modify: `/Users/navec/Projects/follow/src/infrastructure/http/express/routes/endpoints.ts`
- Create: `/Users/navec/Projects/follow/tests/integration/http/media/media-sync.routes.integration.spec.ts`

**Step 1: Write the failing integration tests**

```ts
it("returns 403 when the user lacks media:write", async () => {
  const response = await request(app).post("/media/sync").set("Authorization", token).send(body);
  expect(response.status).toBe(403);
});

it("starts a targeted sync for an authorized admin", async () => {
  const response = await request(app).post("/media/sync").set("Authorization", adminToken).send(body);
  expect(response.status).toBe(202);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:integration -- tests/integration/http/media/media-sync.routes.integration.spec.ts`
Expected: FAIL because the route and permission middleware do not exist.

**Step 3: Write minimal implementation**

```ts
router.post("/sync", requireAuth(tokenService), requirePermission("media:write"), controller.sync);
```

**Step 4: Run test to verify it passes**

Run: `npm run test:integration -- tests/integration/http/media/media-sync.routes.integration.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/http tests/integration/http/media
git commit -m "feat(media): add admin sync endpoint"
```

### Task 7: Add cron-driven feed synchronization

**Files:**
- Create: `/Users/navec/Projects/follow/src/infrastructure/scheduling/media-sync.scheduler.spec.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/scheduling/media-sync.scheduler.ts`
- Modify: `/Users/navec/Projects/follow/src/bootstrap/container.ts`
- Modify: `/Users/navec/Projects/follow/src/bootstrap/server.ts`
- Modify: `/Users/navec/Projects/follow/package.json`

**Step 1: Write the failing tests**

```ts
it("registers configured feed sync jobs and invokes the shared use case", async () => {
  scheduler.start();
  expect(registerCronJob).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/infrastructure/scheduling/media-sync.scheduler.spec.ts`
Expected: FAIL because the scheduler does not exist.

**Step 3: Write minimal implementation**

```ts
cron.schedule(expression, () => void syncMediaUseCase.execute(feedRequest, systemActor));
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/infrastructure/scheduling/media-sync.scheduler.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/scheduling src/bootstrap package.json
git commit -m "feat(media): add cron sync scheduler"
```

### Task 8: Add MangaDex provider once the first provider path is stable

**Files:**
- Create: `/Users/navec/Projects/follow/src/infrastructure/providers/mangadex/mangadex-media-sync.provider.spec.ts`
- Create: `/Users/navec/Projects/follow/src/infrastructure/providers/mangadex/mangadex-media-sync.provider.ts`
- Modify: `/Users/navec/Projects/follow/src/infrastructure/providers/shared/provider-registry.ts`

**Step 1: Write the failing tests**

```ts
it("maps a MangaDex work response into a normalized aggregate", async () => {
  const result = await provider.fetch(request);
  expect(result[0].type).toBe("manga");
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/infrastructure/providers/mangadex/mangadex-media-sync.provider.spec.ts`
Expected: FAIL because the MangaDex provider does not exist.

**Step 3: Write minimal implementation**

```ts
export class MangadexMediaSyncProvider {
  async fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    const payload = await this.client.getWorkOrFeed(request);
    return mapMangadexPayload(payload);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/infrastructure/providers/mangadex/mangadex-media-sync.provider.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/infrastructure/providers/mangadex src/infrastructure/providers/shared
git commit -m "feat(media): add mangadex sync provider"
```

### Task 9: Update documentation and verify the full slice

**Files:**
- Modify: `/Users/navec/Projects/follow/README.md`
- Modify: `/Users/navec/Projects/follow/docs/plans/2026-03-10-media-sync-design.md`

**Step 1: Document runtime configuration**
- Add provider credentials, cron configuration, and sync endpoint notes.

**Step 2: Run verification commands**

Run: `npm run lint`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run test:unit`
Expected: PASS

Run: `npm run test:integration`
Expected: PASS

**Step 3: Commit**

```bash
git add README.md docs/plans/2026-03-10-media-sync-design.md
git commit -m "docs(media): document sync feature"
```
