# Hexagonal Express API (TypeScript)

Base backend API en TypeScript avec:

- Express
- Architecture hexagonale (ports/adapters)
- Auth JWT (use-cases orientés auth)
- Hash mot de passe avec `argon2` (salt géré par la lib)
- Postgres (adaptateur de persistance)
- ESLint (flat config + tri d'imports + règles de couches)
- Vitest (tests unitaires co-localisés + intégration)

## Node / NVM

Le projet cible **Node 24 LTS**.

```bash
nvm install 24
nvm use 24
node -v
```

## Installation

```bash
npm install
cp .env.example .env
```

## Variables d'environnement

Voir `/Users/navec/Projects/follow/.env.example`.

Variables clés:

- `DATABASE_URL`
- `TEST_DATABASE_URL` (tests d'intégration)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`

## Base Postgres locale (Docker Compose)

Démarrer Postgres en local (mode dev) :

```bash
docker compose up -d postgres
```

Arrêter :

```bash
docker compose stop postgres
```

Supprimer le conteneur + volume (reset DB local) :

```bash
docker compose down -v
```

URL de connexion par défaut (compose) :

```bash
postgres://postgres:postgres@localhost:5432/follow
```

Créer la base de test dédiée (une fois) :

```bash
docker exec -it follow-postgres createdb -U postgres follow_test
# ou via le script du projet (lit TEST_DATABASE_URL)
npm run db:test:create
```

## Scripts

```bash
npm run dev          # tsx watch (serveur Express)
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run lint:fix     # auto-fix + tri imports
npm run test:unit    # tests unitaires co-localisés (domain/application)
npm run test:coverage  # coverage sur unitaires + intégration
npm run test:integration  # nécessite TEST_DATABASE_URL + DB follow_test
npm run build        # build -> dist/
npm run db:migrate:new -- create_users
npm run db:test:create   # crée la DB de test depuis TEST_DATABASE_URL
npm run db:migrate:up
npm run db:migrate:down
npm run db:migrate:status
```

## Reproduire la CI localement (Makefile + Docker)

Le `Makefile` orchestre l'exécution dans un conteneur `node:24` avec Postgres Docker, pour coller au plus près de GitHub Actions.

```bash
make up         # démarre Postgres
make ci-draft   # lint + typecheck + build (équivalent PR draft)
make ci-ready   # équivalent PR ready (tests unitaires + intégration + coverage)
make ci-ready-fast # idem sans docker build (plus rapide en local)
make ci         # alias de ci-ready
make down       # stoppe les services
```

Exécuter un sous-ensemble :

```bash
make test-unit
make test-integration
make test-coverage
make db-test-create
make deps       # installe dépendances dans le conteneur (cache local)
```

Gate coverage fichiers modifiés (si SHAs disponibles) :

```bash
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD make coverage-gate
```

## Image Docker de l'application (runtime minimale)

Build :

```bash
docker build -t follow-api .
```

Run (avec .env local) :

```bash
docker run --rm -p 3000:3000 --env-file .env follow-api
```

Note: l'image utilise un `Dockerfile` multi-stage (`node:24-bookworm-slim`) et embarque seulement `dist/` + dépendances de production.

## Structure (résumé)

- `src/domain` : règles métier / value objects / erreurs
- `src/application` : use-cases + ports
- `src/infrastructure` : Express, Zod, Postgres, JWT, argon2
- `src/bootstrap` : composition root
- `tests/integration` : tests d'intégration HTTP/DB

## Endpoints auth (MVP)

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)

## Migration Postgres (MVP)

Migrations SQL (timestampées) dans `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/migrations/`.

Exemples :

- `npm run db:migrate:new -- add_refresh_tokens`
- `npm run db:migrate:up`
- `npm run db:migrate:down`
- `npm run db:migrate:status`

Migration initiale actuelle : `/Users/navec/Projects/follow/src/infrastructure/persistence/postgres/migrations/20260223T160000_create_users.up.sql`

## Tests d'intégration (Express + Postgres)

Pré-requis :

- Postgres local démarré (`docker compose up -d postgres`)
- base `follow_test` créée
- `TEST_DATABASE_URL` défini dans `.env`

Les tests d'intégration :

- appliquent les migrations `up` sur la DB de test (une seule fois)
- utilisent les vrais adaptateurs Postgres / argon2 / JWT
- truncatent `users` entre les tests

## CI GitHub Actions (PR draft vs ready)

Workflow PR :

- Toujours (draft + ready) : `lint`, `typecheck + build`, `docker build`
- Seulement PR ready (non-draft) : `test:unit`, `test:integration`, gate coverage nouveau code (>= 90% sur fichiers modifiés `src/domain` + `src/application`)

Reproduire le gate coverage localement (exemple) :

```bash
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD npm run test:coverage
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD node scripts/check-changed-files-coverage.mjs
```
