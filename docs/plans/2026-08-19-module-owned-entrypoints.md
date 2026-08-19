# Module-Owned Entrypoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Supprimer `src/entrypoints` en faisant posséder à chaque module ses entrypoints HTTP et scheduler, puis faire assembler leurs contributions déclaratives par Bootstrap sans modifier le comportement HTTP.

**Architecture:** `createAuthModule()` et `createMediaModule()` retournent leur API publique et des descriptions de routes, tandis que Media retourne aussi ses jobs planifiés. `shared/http` fournit uniquement les contrats et mécanismes HTTP transversaux, `shared/scheduling` fournit le contrat de job, et `bootstrap/http/app.ts` interprète les contributions sans introduire de dépendance entre Auth et Media.

**Tech Stack:** Node.js 24, TypeScript strict, Express 5, Zod, PostgreSQL, Vitest, Supertest, ESLint Boundaries

---

## Preconditions

- Work only in `/Users/navec/Projects/follow/.worktrees/module-owned-entrypoints` on `codex/module-owned-entrypoints`.
- Load `/Users/navec/Projects/follow/.env` before PostgreSQL integration tests; do not copy or commit that file.
- Keep every existing HTTP path, status, envelope, error code, error message, and authentication outcome unchanged.
- Follow `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before every commit.
- The versioned pre-commit hook currently conflicts with the already-running fixed-name `follow-postgres` container from a worktree. Run the equivalent lint, typecheck, build, and relevant tests manually before using `git commit --no-verify`; never stop or replace the user's existing container.

### Task 1: Introduce declarative HTTP contracts and registry

**Files:**
- Create: `src/shared/http/contracts/http-module-definition.ts`
- Create: `src/shared/http/route-registry.ts`
- Create: `src/shared/http/route-registry.spec.ts`
- Modify: `eslint.config.js`

**Step 1: Write the failing registry tests**

Create tests with two fake module definitions and Supertest. Assert that:

```ts
expect(await request(app).get("/public/ping")).toMatchObject({ status: 200 });
expect(authenticate).not.toHaveBeenCalled();

expect(await request(app).post("/private/action")).toMatchObject({ status: 204 });
expect(authenticate).toHaveBeenCalledTimes(1);
```

Also assert that `flattenHttpEndpoints()` returns normalized full paths and
that duplicate `method + full path` definitions throw before registration.

**Step 2: Verify RED**

Run:

```bash
npx vitest run src/shared/http/route-registry.spec.ts
```

Expected: FAIL because the shared contract and registry do not exist.

**Step 3: Implement the minimal contracts**

Define:

```ts
export type HttpMethod = "GET" | "POST";
export type HttpAccess = "public" | "authenticated";

export interface HttpRouteDefinition {
  method: HttpMethod;
  path: string;
  access: HttpAccess;
  handler: RequestHandler;
}

export interface HttpModuleDefinition {
  id: string;
  basePath: string;
  routes: ReadonlyArray<HttpRouteDefinition>;
}
```

Implement `registerHttpModules(app, modules, authenticate)` with an Express
router per module. Apply `authenticate` only when `access` is
`"authenticated"`. Implement `flattenHttpEndpoints(modules)` and reject route
collisions using the normalized method and full path.

Add `shared-http` and `shared-scheduling` boundary element types. Temporarily
allow the existing global entrypoint and Bootstrap to import `shared-http`;
module-specific restrictions are tightened in Task 6.

**Step 4: Verify GREEN**

Run:

```bash
npx vitest run src/shared/http/route-registry.spec.ts
npm run lint
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/http eslint.config.js
git commit --no-verify -m "feat(http): add declarative route registry"
```

### Task 2: Move shared HTTP mechanisms out of the global entrypoint

**Files:**
- Move: `src/entrypoints/http/context/authenticated-request.ts` → `src/shared/http/context/authenticated-request.ts`
- Move: `src/entrypoints/http/middleware/authenticate.ts` → `src/shared/http/middleware/authentication.middleware.ts`
- Move: `src/entrypoints/http/middleware/authenticate.spec.ts` → `src/shared/http/middleware/authentication.middleware.spec.ts`
- Move: `src/entrypoints/http/middleware/request-logger.ts` → `src/shared/http/middleware/request-logger.middleware.ts`
- Move: `src/entrypoints/http/middleware/request-logger.spec.ts` → `src/shared/http/middleware/request-logger.middleware.spec.ts`
- Move: `src/entrypoints/http/validation/validator.ts` → `src/shared/http/validation/validator.ts`
- Move: `src/entrypoints/http/validation/zod-validator.ts` → `src/shared/http/validation/zod-validator.ts`
- Move: `src/entrypoints/http/error-handler.ts` → `src/shared/http/error-handler.ts`
- Move: `src/entrypoints/http/error-handler.spec.ts` → `src/shared/http/error-handler.spec.ts`
- Modify: imports in current controllers, routes, and `src/entrypoints/http/app.ts`

**Step 1: Rewrite the authentication test against a resolver function**

The test must pass a resolver rather than an `AuthApi`:

```ts
const resolveIdentity = vi.fn().mockResolvedValue(identity);
await createAuthenticationMiddleware(resolveIdentity)(request, response, next);
expect(resolveIdentity).toHaveBeenCalledWith("token");
```

Keep the absent and blank bearer-token cases and assert that the forwarded
error retains `{ code: "UNAUTHORIZED", message: "Unauthorized" }`.

**Step 2: Verify RED**

Run:

```bash
npx vitest run src/shared/http/middleware/authentication.middleware.spec.ts
```

Expected: FAIL because the moved middleware still expects `AuthApi` or the new
file does not exist yet.

**Step 3: Implement the transport-neutral authentication boundary**

Add an `AuthenticatedHttpIdentity` request-context type with `userId`, `email`,
`role`, and `permissions`. Define `ResolveIdentity` as a function type. The
middleware extracts the bearer token, calls the resolver, attaches the public
identity, and creates its own HTTP unauthorized error without importing Auth.

Move the remaining shared files and update imports only; do not change their
behavior.

**Step 4: Verify GREEN and moved behavior**

Run:

```bash
npx vitest run src/shared/http
npm run lint
npm run typecheck
```

Expected: PASS and `rg -n '@auth' src/shared` returns no matches.

**Step 5: Commit**

```bash
git add src/shared src/entrypoints/http
git commit --no-verify -m "refactor(http): centralize shared transport mechanisms"
```

### Task 3: Make Auth own and declare its HTTP entrypoint

**Files:**
- Move: `src/entrypoints/http/controllers/auth.controller.ts` → `src/modules/auth/entrypoints/http/auth.controller.ts`
- Move: `src/entrypoints/http/presenters/auth.presenter.ts` → `src/modules/auth/entrypoints/http/auth.presenter.ts`
- Move: `src/entrypoints/http/routes/auth.routes.ts` → `src/modules/auth/entrypoints/http/auth.routes.ts`
- Move: `src/entrypoints/http/validation/schemas/auth.schemas.ts` → `src/modules/auth/entrypoints/http/auth.schemas.ts`
- Create: `src/modules/auth/entrypoints/http/auth.routes.spec.ts`
- Modify: `src/modules/auth/auth.module.ts`
- Create: `src/modules/auth/auth.module.spec.ts`
- Modify: `src/entrypoints/http/app.ts`

**Step 1: Write failing Auth contribution tests**

Assert that `createAuthModule()` returns `{ api, http }`, with:

```ts
expect(auth.http).toMatchObject({
  id: "auth",
  basePath: "/auth",
  routes: [
    { method: "POST", path: "/register", access: "public" },
    { method: "POST", path: "/login", access: "public" },
    { method: "GET", path: "/me", access: "authenticated" },
  ],
});
```

Exercise the returned handlers with a fake `AuthApi` and validator to confirm
the existing 201 register, 200 login, and `/me` presenter envelopes.

**Step 2: Verify RED**

Run:

```bash
npx vitest run src/modules/auth/auth.module.spec.ts src/modules/auth/entrypoints/http/auth.routes.spec.ts
```

Expected: FAIL because Auth currently returns only `AuthApi` and does not own
its route contribution.

**Step 3: Move and minimally compose Auth HTTP**

Create the controller and route definitions inside Auth. Inject `BodyValidator`
through `AuthModuleDependencies.http`. Return:

```ts
return {
  api,
  http: createAuthHttpDefinition({ api, bodyValidator }),
};
```

Do not put authentication middleware in Auth routes; declare `/me` as
`authenticated`. Update the temporary global app to consume `auth.api` and
`auth.http` until Bootstrap composition is replaced in Task 5.

**Step 4: Verify GREEN and HTTP compatibility**

Run:

```bash
npx vitest run src/modules/auth src/shared/http
set -a; source /Users/navec/Projects/follow/.env; set +a; npm run test:integration -- tests/integration/http/auth/auth.routes.integration.spec.ts
npm run typecheck
```

Expected: PASS with the existing Auth integration response shapes.

**Step 5: Commit**

```bash
git add src/modules/auth src/entrypoints/http/app.ts src/entrypoints/http
git commit --no-verify -m "refactor(auth): own declarative http entrypoint"
```

### Task 4: Make Media own HTTP and scheduled contributions

**Files:**
- Move: `src/entrypoints/http/controllers/media-sync.controller.ts` → `src/modules/media/entrypoints/http/media-sync.controller.ts`
- Move: `src/entrypoints/http/routes/media.routes.ts` → `src/modules/media/entrypoints/http/media.routes.ts`
- Move: `src/entrypoints/http/validation/schemas/media-sync.schemas.ts` → `src/modules/media/entrypoints/http/media-sync.schemas.ts`
- Create: `src/modules/media/entrypoints/http/media.presenter.ts`
- Create: `src/modules/media/entrypoints/http/media.routes.spec.ts`
- Move: `src/entrypoints/scheduler/media-sync.scheduler.ts` → `src/modules/media/entrypoints/scheduler/media-sync.jobs.ts`
- Move: `src/entrypoints/scheduler/media-sync.scheduler.spec.ts` → `src/modules/media/entrypoints/scheduler/media-sync.jobs.spec.ts`
- Create: `src/shared/scheduling/scheduled-job-definition.ts`
- Modify: `src/modules/media/media.module.ts`
- Modify: `src/modules/media/media.module.spec.ts`
- Modify: `src/entrypoints/http/app.ts`

**Step 1: Write failing Media contribution tests**

Extend the module test to assert `{ api, http, scheduledJobs }`. The route must
be:

```ts
{ method: "POST", path: "/sync", access: "authenticated" }
```

The HTTP handler test must retain status 202 and `{ data: result }`. The
scheduler test must assert that a configured job definition contains the cron
expression and that calling its handler invokes `MediaApi.sync()` with the
existing system actor and TMDB popular-feed command.

**Step 2: Verify RED**

Run:

```bash
npx vitest run src/modules/media/media.module.spec.ts src/modules/media/entrypoints
```

Expected: FAIL because Media currently exposes only its API and owns neither
declarative contribution.

**Step 3: Implement the Media contributions**

Move the controller, schema, and routes into Media. Extract the inline response
mapping into `mediaPresenter.sync(result)` without changing the JSON. Inject
`BodyValidator` and scheduler configuration into `MediaModuleDependencies`.

Define the transport-neutral shared job contract:

```ts
export interface ScheduledJobDefinition {
  id: string;
  expression: string;
  handler(): void | Promise<void>;
}
```

Return no job when `MEDIA_SYNC_TMDB_FEED_CRON` is absent. Keep the system actor
and command private to Media's scheduler entrypoint.

**Step 4: Verify GREEN and module independence**

Run:

```bash
npx vitest run src/modules/media src/shared/scheduling
set -a; source /Users/navec/Projects/follow/.env; set +a; npm run test:integration -- tests/integration/http/media/media-sync.routes.integration.spec.ts
rg -n '@auth|modules/auth' src/modules/media
npm run typecheck
```

Expected: tests PASS and the search returns no matches.

**Step 5: Commit**

```bash
git add src/modules/media src/shared/scheduling src/entrypoints
git commit --no-verify -m "refactor(media): own http and scheduled entrypoints"
```

### Task 5: Assemble module contributions in Bootstrap

**Files:**
- Create: `src/bootstrap/http/app.ts`
- Create: `src/bootstrap/http/app.spec.ts`
- Modify: `src/bootstrap/container.ts`
- Modify: `src/bootstrap/container.spec.ts`
- Modify: `src/bootstrap/server.ts`
- Modify: `tests/integration/helpers/test-app.ts`
- Delete: `src/entrypoints/http/app.ts`
- Delete: `src/entrypoints/http/routes/endpoints.ts`
- Delete: `src/entrypoints/http/routes/endpoints.spec.ts`
- Delete: remaining empty files/directories under `src/entrypoints`

**Step 1: Write the failing Bootstrap composition test**

Build fake Auth and Media module contributions. Assert that the Bootstrap app:

- returns 200 `{ data: { status: "ok" } }` for `/health`;
- mounts both module base paths;
- calls Auth's resolver only for `authenticated` routes;
- preserves module-handler responses;
- exposes flattened endpoints in the existing startup-log order.

**Step 2: Verify RED**

Run:

```bash
npx vitest run src/bootstrap/http/app.spec.ts
```

Expected: FAIL because `src/bootstrap/http/app.ts` does not exist.

**Step 3: Implement Bootstrap composition**

Create the Express app, root health definition, request logger, authentication
middleware, registry call, and error handler under `bootstrap/http/app.ts`.
Adapt Auth with:

```ts
const resolveIdentity: ResolveIdentity = (token) => auth.api.authenticate(token);
```

Update the container to create a shared `ZodBodyValidator`, pass HTTP
dependencies into module factories, pass scheduler configuration to Media,
and expose module APIs as `auth.api` and `media.api` where compatibility
requires it. Update `server.ts` to register every scheduled job with
`cron.schedule` and log endpoints flattened from the actual contributions.

Delete the global app and central static endpoint inventory.

**Step 4: Verify GREEN and absence of the global entrypoint**

Run:

```bash
npx vitest run src/bootstrap src/shared/http
test ! -d src/entrypoints
npm run lint
npm run typecheck
```

Expected: PASS and `src/entrypoints` is absent.

**Step 5: Commit**

```bash
git add src/bootstrap src/shared src/modules tests/integration src/entrypoints tsconfig.json
git commit --no-verify -m "refactor(bootstrap): assemble module contributions"
```

### Task 6: Enforce the final dependency boundaries

**Files:**
- Modify: `eslint.config.js`
- Modify: `tsconfig.json`
- Modify: `tsconfig.build.json` only if an obsolete alias remains there
- Modify: `README.md`

**Step 1: Add a failing architecture fixture or rule assertion**

Add or extend the architecture lint test/configuration so that a module domain
or application file importing `shared/http` is rejected, while
`modules/*/entrypoints/http` may import it. Ensure `shared` cannot import
modules, and remove the obsolete `@entrypoints/*` alias.

**Step 2: Verify RED**

Run the focused architecture test or `npm run lint` against the deliberately
forbidden fixture.

Expected: FAIL before the final boundary elements are differentiated.

**Step 3: Implement final boundary elements**

Classify module composition roots, module entrypoints, module public surfaces,
module internals, `shared-http`, `shared-scheduling`, Platform, and Bootstrap in
specific-before-general order. Allow only the dependency flow from the design.
Remove the temporary fixture after observing the correct failure.

Update README architecture and commands so no active documentation points to
`src/entrypoints` or `@entrypoints`.

**Step 4: Verify GREEN**

Run:

```bash
npm run lint
npm run typecheck
rg -n 'src/entrypoints|@entrypoints' src tests README.md eslint.config.js tsconfig*.json
```

Expected: lint and typecheck PASS; the search returns no active references.

**Step 5: Commit**

```bash
git add eslint.config.js tsconfig.json tsconfig.build.json README.md
git commit --no-verify -m "build(architecture): enforce module-owned entrypoints"
```

### Task 7: Run full verification and document the architecture

**Files:**
- Modify: `docs/plans/2026-08-19-modular-architecture-design.md`
- Modify: `docs/plans/2026-08-19-module-owned-entrypoints-design.md` only if implementation details required an approved correction

**Step 1: Update the durable architecture documentation**

Replace the old global-entrypoint structure with module-owned entrypoints,
declarative HTTP and scheduler contributions, shared transport mechanisms, and
Bootstrap registration. Keep the historical implementation plan unchanged.

**Step 2: Run the complete verification suite**

Run:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:adapters
set -a; source /Users/navec/Projects/follow/.env; set +a; npm run test:integration
set -a; source /Users/navec/Projects/follow/.env; set +a; npm test
npm run build
test ! -d src/entrypoints
git diff --check
```

Expected: every command exits 0, all 70 existing tests plus the new registry,
module contribution, and Bootstrap tests pass, and no global entrypoint
directory remains.

**Step 3: Review HTTP compatibility explicitly**

Re-read the Auth and Media integration expectations and compare the final diff
against the design checklist: paths, statuses, envelopes, authentication,
authorization, error translation, endpoint logging, and scheduled Media sync.

**Step 4: Commit documentation**

```bash
git add -f docs/plans/2026-08-19-modular-architecture-design.md docs/plans/2026-08-19-module-owned-entrypoints-design.md
git commit --no-verify -m "docs(architecture): document module-owned entrypoints"
```

**Step 5: Request review and finish the branch**

Use `superpowers:requesting-code-review`, address validated findings with
`superpowers:receiving-code-review`, rerun the full verification suite, then
use `superpowers:finishing-a-development-branch` to present integration options.
