# Module-Owned Entrypoints Design

## Objective

Move every business entrypoint into the module that owns it and remove the
global `src/entrypoints` directory. Each module exposes its public API and
declarative technical contributions from one `createModule()` factory, while
Bootstrap remains responsible for assembling those contributions.

The refactor must preserve all existing HTTP paths, status codes, response
envelopes, error mappings, authentication behavior, scheduled work, and public
module independence.

## Chosen architecture

Each module owns its domain, application layer, outbound adapters, public API,
and inbound entrypoints:

```text
src/
├── modules/
│   ├── auth/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── adapters/
│   │   ├── public/
│   │   ├── entrypoints/http/
│   │   └── auth.module.ts
│   └── media/
│       ├── domain/
│       ├── application/
│       ├── adapters/
│       ├── public/
│       ├── entrypoints/{http,scheduler}/
│       └── media.module.ts
├── shared/
│   ├── http/
│   │   ├── contracts/
│   │   ├── context/
│   │   ├── middleware/
│   │   ├── validation/
│   │   ├── error-handler.ts
│   │   └── route-registry.ts
│   └── scheduling/
│       └── scheduled-job-definition.ts
└── bootstrap/
    ├── http/app.ts
    ├── container.ts
    └── server.ts
```

`shared/http` contains only transport-level mechanisms that are genuinely
shared. It does not contain business rules and does not import a business
module. A module's domain and application layers never import Express or
`shared/http`; only its HTTP entrypoint may do so.

## Module factories

A module factory constructs the module once and returns both its public API and
its declarative contributions:

```ts
interface AuthModule {
  api: AuthApi;
  http: HttpModuleDefinition;
}

interface MediaModule {
  api: MediaApi;
  http: HttpModuleDefinition;
  scheduledJobs: ReadonlyArray<ScheduledJobDefinition>;
}
```

Bootstrap supplies infrastructure dependencies to each factory. It uses the
returned APIs for cross-boundary orchestration and interprets the returned
technical definitions. Auth and Media never import one another.

## Declarative HTTP contributions

Modules return route descriptions rather than assembled Express routers:

```ts
interface HttpModuleDefinition {
  basePath: string;
  routes: ReadonlyArray<HttpRouteDefinition>;
}

interface HttpRouteDefinition {
  method: "GET" | "POST";
  path: string;
  access: "public" | "authenticated";
  handler: RequestHandler;
}
```

The contract deliberately remains minimal. Authorization permissions, rate
limits, caching, validation schemas, and other policies are not added to route
metadata without a demonstrated cross-module need.

`src/bootstrap/http/app.ts` installs global Express concerns, interprets route
definitions, applies authentication only to routes marked `authenticated`,
mounts each module under its `basePath`, installs the shared error handler, and
owns the technical `/health` endpoint.

The existing endpoint-flattening behavior used for startup logs reads the same
module definitions, so there is no second central route inventory.

## Authentication and authorization

The shared authentication middleware receives a transport-neutral identity
resolver function:

```ts
type ResolveIdentity = (
  accessToken: string,
) => Promise<AuthenticatedHttpIdentity>;
```

Bootstrap adapts Auth's public API to that function:

```ts
resolveIdentity: (token) => auth.api.authenticate(token)
```

The middleware extracts the bearer token, resolves it, and attaches the
identity to the HTTP request. It does not import Auth.

Authentication and authorization remain separate. Route metadata only states
whether an authenticated identity is required. Media maps the HTTP identity to
its own `MediaActor`, and `MediaAuthorizationPolicy` continues to enforce the
`admin` plus `media:write` business rule. No shared authorization middleware is
introduced by this refactor.

## HTTP ownership

Auth owns its controller, presenter, routes, and validation schemas under
`modules/auth/entrypoints/http`. Media owns the corresponding files under
`modules/media/entrypoints/http`.

Controllers orchestrate request validation, public API invocation, and HTTP
status selection. Presenters own the stable public JSON representation. In
particular, Auth continues to map `userId` to `id`, omit internal permissions
from `/auth/me`, and return the existing `data` envelope. Media continues to
return HTTP 202 with the existing synchronization result envelope.

## Scheduled contributions

The Media scheduler moves into `modules/media/entrypoints/scheduler`. Media
returns declarative scheduled job definitions from `createMediaModule()`.
Bootstrap provides the scheduling mechanism and registers each returned job.
The trusted Media system actor and the Media-specific synchronization command
remain owned by Media.

The small transport-neutral `ScheduledJobDefinition` contract lives under
`shared/scheduling`, allowing future modules to contribute jobs without
depending on Media or on the concrete scheduling library.

## Error handling

The shared HTTP error handler keeps the existing code-to-status mapping and
safe public envelopes. It depends only on the public shape of an error and Zod,
not on module internals. Unexpected errors continue to be logged once with a
request ID and returned as a safe HTTP 500 response.

## Dependency rules

The intended dependency flow is:

```text
module domain/application -> module internals only
module outbound adapters  -> module ports + approved Platform contracts
module HTTP entrypoints    -> own public API + shared/http
shared/http                -> shared/http only
bootstrap                  -> module factories + shared/http + Platform
```

ESLint boundaries enforce that:

- Auth and Media never import each other;
- module domain and application code cannot import HTTP concerns;
- only module HTTP entrypoints may import `shared/http` and Express;
- `shared` cannot import modules or Bootstrap;
- Bootstrap may compose factories and technical contributions.

## Migration and testing

The migration is performed in behavior-preserving slices with separate
commits. Test-driven work first introduces failing tests for the declarative
route registry, including public versus authenticated route registration,
mount paths, ordering, endpoint flattening, and route collision handling.

Shared HTTP facilities are then moved without behavior changes, followed by
Auth HTTP ownership, Media HTTP and scheduler ownership, Bootstrap composition,
and boundary enforcement. Existing integration tests characterize all current
HTTP contracts throughout the migration.

Final verification includes lint, strict type checking, unit tests, adapter and
entrypoint tests, PostgreSQL integration tests, build output, and a filesystem
check confirming that `src/entrypoints` no longer exists.
