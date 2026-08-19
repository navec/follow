# Modular Architecture

**Status:** Implemented on 2026-08-19

## Purpose

The backend is split into independent business modules. Each module owns its
domain, application layer, outbound adapters, public API, and inbound technical
entrypoints. Bootstrap constructs the modules once and assembles their declared
HTTP routes and scheduled jobs.

Auth and Media never import one another. Cross-module coordination goes through
public APIs and transport-neutral shared contracts.

## Source layout

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
│       ├── entrypoints/http/
│       ├── entrypoints/scheduler/
│       └── media.module.ts
├── shared/
│   ├── http/
│   └── scheduling/
├── platform/
└── bootstrap/
    ├── http/app.ts
    ├── container.ts
    └── server.ts
```

## Module composition roots

`createAuthModule()` returns the Auth public API and its HTTP contribution.
`createMediaModule()` returns the Media public API, its HTTP contribution, and
its scheduled-job contributions.

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

The factories receive infrastructure dependencies from Bootstrap. Entry points
receive only the public API and technical dependencies they need, such as the
shared body validator.

## HTTP composition

Module HTTP entrypoints declare method, relative path, access mode, and handler.
They do not construct global routers or import another business module.

`bootstrap/http/app.ts` owns the technical `/health` route, JSON parsing,
request logging, authentication adaptation, route registration, and shared
error handling. It registers the root, Auth, and Media definitions in startup
log order and exposes the flattened endpoint list derived from those same
definitions.

For authenticated routes, Bootstrap adapts `AuthApi.authenticate()` to the
transport-neutral `ResolveIdentity` function. The shared middleware attaches an
`AuthenticatedHttpIdentity` to the request. Media then maps that identity to a
`MediaActor`; Media's own authorization policy continues to enforce the admin
role and `media:write` permission.

## Scheduling composition

Media owns the system actor, TMDB popular-feed command, and job handler. When
`MEDIA_SYNC_TMDB_FEED_CRON` is configured, Media declares one
`ScheduledJobDefinition`; otherwise it declares no job. Bootstrap registers all
declared jobs with `node-cron` and owns process lifecycle concerns.

## Shared and Platform boundaries

`shared/http` contains only HTTP contracts and reusable transport mechanisms:
route registration, authentication context and middleware, validation, request
logging, and error translation. `shared/scheduling` contains the neutral job
contract. Shared code cannot import a business module or Bootstrap.

Platform owns configuration, logging, and PostgreSQL resources. Module domain
and application code cannot import Express or shared HTTP mechanisms. Only
module HTTP entrypoints and module composition roots may depend on
`shared/http`; only Media's scheduler entrypoint and composition root may depend
on `shared/scheduling`. ESLint Boundaries enforces these directions.

## Stable external behavior

The architecture preserves the existing external contracts:

- `POST /auth/register` returns HTTP 201 with the existing `data` envelope;
- `POST /auth/login` returns HTTP 200 with the existing `data` envelope;
- `GET /auth/me` remains authenticated and omits internal permissions;
- `POST /media/sync` remains authenticated, returns HTTP 202, and preserves
  Media authorization and error translation;
- public routes do not invoke authentication;
- startup endpoint logging is generated from registered contributions;
- scheduled Media synchronization uses the existing trusted actor and command.

Unit tests cover module contributions and shared mechanisms. Bootstrap tests
cover composition and endpoint ordering. PostgreSQL integration tests protect
the complete HTTP behavior.
