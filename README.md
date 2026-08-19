# Backend modulaire Express (TypeScript)

Backend TypeScript organisé en modules métier isolés, avec :

- Express
- Architecture modulaire et hexagonale (ports/adapters)
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

Voir `.env.example`.

Variables clés:

- `DATABASE_URL`
- `TEST_DATABASE_URL` (tests d'intégration)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `TMDB_READ_ACCESS_TOKEN` (optionnel en local, requis pour appeler réellement TMDB)
- `TMDB_BASE_URL` (défaut : `https://api.themoviedb.org/3`)
- `TMDB_DEFAULT_LANGUAGE` et `TMDB_DEFAULT_REGION`
- `TMDB_REQUEST_TIMEOUT_MS`
- `MEDIA_SYNC_TMDB_FEED_CRON` (optionnel, expression cron pour un import feed TMDB)

Sans `TMDB_READ_ACCESS_TOKEN`, l’application démarre sans appel réseau TMDB : les
feeds sont vides et une synchronisation ciblée utilise uniquement l’identifiant et
le type demandés. Ce mode dégradé est destiné au développement et aux tests.

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
npm run test:adapters # adapters, Platform et entrypoints
npm run test:coverage  # coverage sur unitaires + intégration
npm run test:integration  # nécessite TEST_DATABASE_URL + DB follow_test
npm run build        # build -> dist/
npm run db:migrate:new -- auth add_refresh_tokens
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
make install-hooks # active le pre-commit hook (make ci-draft à chaque commit)
make down       # stoppe les services
```

Exécuter un sous-ensemble :

```bash
make test-unit
make test-adapters
make test-integration
make test-coverage
make db-test-create
make deps       # installe dépendances dans le conteneur (cache local)
```

Gate coverage fichiers modifiés (si SHAs disponibles) :

```bash
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD make coverage-gate
```

## Normaliser les commits

Le repo fournit des hooks git versionnés pour :
- lancer `make ci-draft` avant chaque commit (`pre-commit`)
- valider le format Conventional Commit (`commit-msg`)

Format attendu :

```text
type(scope): summary
```

Exemple :

```text
feat(auth): enforce verifyPassword check
```

Activer les hooks :

```bash
make install-hooks
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

- `src/modules/auth` et `src/modules/media` : domaine, cas d’usage, ports,
  adaptateurs et contrat public propres à chaque module
- `src/entrypoints` : traduction des déclencheurs HTTP et scheduler vers les API
  publiques des modules
- `src/platform` : configuration, journalisation et ressources PostgreSQL
- `src/bootstrap` : composition des modules et gestion du cycle de vie
- `tests/integration` : tests d'intégration HTTP/DB

Auth et Media ne s’importent jamais mutuellement. Un consommateur externe utilise
uniquement `@auth` ou `@media`; les détails `domain`, `application` et `adapters`
restent internes au module. ESLint vérifie ces frontières.

### Flux HTTP protégé

1. L’entrypoint HTTP valide le payload.
2. Le middleware appelle `AuthApi.authenticate` avec le bearer token.
3. L’identité publique Auth est stockée sur la requête.
4. Pour Media, le contrôleur la convertit explicitement en `MediaActor`.
5. `MediaApi` applique sa propre politique d’autorisation puis exécute la commande.
6. L’entrypoint traduit le résultat ou l’erreur publique en réponse HTTP stable.

## Endpoints auth (MVP)

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)

## Endpoint media sync

- `POST /media/sync`

Payloads supportés actuellement :

```json
{
  "provider": "tmdb",
  "params": {
    "target": "work",
    "externalId": 123,
    "type": "movie"
  }
}
```

```json
{
  "provider": "mangadex",
  "params": {
    "target": "work",
    "externalId": "uuid-or-id",
    "type": "manga"
  }
}
```

Accès requis :

- JWT valide
- utilisateur avec `role=admin`
- permission `media:write`

Le scheduler utilise uniquement `MediaApi`, avec un `MediaActor` système dédié. Le
premier job supporté est un feed TMDB `popular` déclenché par
`MEDIA_SYNC_TMDB_FEED_CRON`.

## Migration Postgres (MVP)

Chaque module possède ses migrations SQL timestampées dans
`src/modules/<module>/adapters/out/postgres/migrations/`. Une commande unique
découvre les migrations de tous les modules.

Exemples :

- `npm run db:migrate:new -- auth add_refresh_tokens`
- `npm run db:migrate:new -- media add_media_status`
- `npm run db:migrate:up`
- `npm run db:migrate:down`
- `npm run db:migrate:status`

Exemple Auth :
`src/modules/auth/adapters/out/postgres/migrations/20260223T160000_create_users.up.sql`.

## Tests d'intégration (Express + Postgres)

Pré-requis :

- Postgres local démarré (`docker compose up -d postgres`)
- base `follow_test` créée
- `TEST_DATABASE_URL` défini dans `.env`

Les tests d'intégration :

- appliquent les migrations `up` sur la DB de test (une seule fois)
- utilisent les vrais adaptateurs Postgres / argon2 / JWT
- truncatent `users` entre les tests

Pour la slice media sync, une base de test dédiée peut être utile pour éviter de réutiliser un historique de migrations déjà corrompu, par exemple :

```bash
docker exec -it follow-postgres createdb -U postgres follow_media_sync_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/follow_media_sync_test npm run test:integration
```

## CI GitHub Actions (PR draft vs ready)

Workflow PR :

- Toujours (draft + ready) : `lint`, `typecheck + build`, `docker build`
- Seulement PR ready (non-draft) : `test:unit`, `test:adapters`,
  `test:integration`, gate coverage nouveau code (>= 90% sur les fichiers
  `domain` et `application` des modules modifiés)

Reproduire le gate coverage localement (exemple) :

```bash
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD npm run test:coverage
GITHUB_BASE_SHA=<base_sha> GITHUB_HEAD_SHA=HEAD node scripts/check-changed-files-coverage.mjs
```
