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
- `TMDB_IMAGE_BASE_URL` (défaut : `https://image.tmdb.org/t/p/original`)
- `TMDB_DEFAULT_LANGUAGE` et `TMDB_DEFAULT_REGION`
- `TMDB_REQUEST_TIMEOUT_MS`
- `MEDIA_SYNC_TMDB_FEED_CRON` (optionnel, expression cron pour un import feed TMDB)
- `MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON` (optionnel, réconciliation de l’export quotidien)
- `MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON` (optionnel, découverte des films modifiés)
- `MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON` (optionnel, hydratation d’un lot de films)
- `TMDB_EXPORT_BASE_URL` (défaut : `https://files.tmdb.org/p/exports/`)
- `TMDB_CATALOG_STAGE_BATCH_SIZE` (défaut : `1000`)
- `TMDB_CATALOG_WORKER_BATCH_SIZE` (défaut : `100`)
- `TMDB_CATALOG_REQUESTS_PER_SECOND` (défaut : `5`)
- `TMDB_CATALOG_CONCURRENCY` (défaut : `5`)
- `TMDB_CATALOG_LEASE_SECONDS` (défaut : `300`)
- `TMDB_CATALOG_MAX_ATTEMPTS` (défaut : `8`)
- `TMDB_CATALOG_RETRY_BASE_MS` (défaut : `1000`)
- `TMDB_CATALOG_RETRY_MAX_MS` (défaut : `3600000`)

Sans `TMDB_READ_ACCESS_TOKEN`, l’application démarre sans appel réseau TMDB : les
feeds sont vides et une synchronisation ciblée utilise uniquement l’identifiant et
le type demandés. Les crons catalogue sont alors interdits par la validation de
configuration. Ce mode dégradé est destiné au développement et aux tests.

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
npm run test:adapters # adapters, Platform et entrypoints des modules
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
  adaptateurs, contrat public et entrypoints propres à chaque module
- `src/shared/http` et `src/shared/scheduling` : contrats et mécanismes techniques
  transversaux, sans dépendance vers un module métier
- `src/platform` : configuration, journalisation et ressources PostgreSQL
- `src/bootstrap` : composition des contributions HTTP et scheduler des modules,
  puis gestion du cycle de vie
- `tests/integration` : tests d'intégration HTTP/DB

Les imports de projet utilisent les sept alias `@auth/*`, `@media/*`,
`@shared/*`, `@platform/*`, `@bootstrap/*`, `@tests/*` et `@scripts/*`.
ESLint rejette les imports relatifs dans `src`, `tests` et `scripts`.

Auth et Media ne s’importent jamais mutuellement. Un consommateur externe utilise
uniquement leurs contrats sous `@auth/public/*` ou `@media/public/*`; les détails
`domain`, `application` et `adapters` restent internes au module. ESLint vérifie
ces frontières.

### Flux HTTP protégé

1. L’entrypoint HTTP possédé par le module valide le payload.
2. Le middleware appelle `AuthApi.authenticate` avec le bearer token.
3. L’identité publique Auth est stockée sur la requête.
4. Pour Media, le contrôleur la convertit explicitement en `MediaActor`.
5. `MediaApi` applique sa propre politique d’autorisation puis exécute la commande.
6. L’entrypoint du module traduit le résultat ou l’erreur publique en réponse
   HTTP stable.

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

Media déclare ses jobs planifiés avec un `MediaActor` système dédié, puis Bootstrap
les enregistre auprès du scheduler. Le feed TMDB `popular` reste déclenché par
`MEDIA_SYNC_TMDB_FEED_CRON`. Les trois jobs catalogue sont décrits ci-dessous.

## Synchronisation du catalogue complet TMDB

Le catalogue complet est opt-in : aucun job catalogue n’est déclaré tant que ses
variables cron ne sont pas définies. Exemple de configuration prudente :

```dotenv
TMDB_READ_ACCESS_TOKEN=...
MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON="15 8 * * *"
MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON="15 * * * *"
MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON="*/1 * * * *"
```

L’inventaire quotidien doit être planifié après 08:00 UTC, heure à partir de
laquelle le job choisit l’export du jour. Avant 08:00 UTC, il choisit celui de la
veille. Le job de changements utilise une fenêtre chevauchée d’un jour et rattrape
au maximum 14 jours par exécution. Le worker traite un lot borné, en respectant le
débit, la concurrence, les leases et les retries configurés.

Le premier import porte potentiellement sur plusieurs millions de films. Selon le
débit TMDB, la latence réseau et la capacité PostgreSQL, il peut durer de nombreuses
heures à plusieurs jours. Il est normal que la queue reste longtemps alimentée ;
les imports suivants sont incrémentaux. La popularité détermine uniquement l’ordre
de priorité. Une baisse de popularité ne supprime jamais un film déjà importé.

États de `tmdb_movie_sync_queue` :

- `pending` : prêt à être hydraté ;
- `processing` : réclamé par un worker jusqu’à l’expiration du lease ;
- `completed` : dernière hydratation terminée ;
- `retry` : nouvel essai planifié après une erreur transitoire ;
- `dead` : indisponible (`404`) ou limite de tentatives atteinte.

Suivi de la progression :

```sql
SELECT status, COUNT(*)
FROM tmdb_movie_sync_queue
GROUP BY status
ORDER BY status;
```

Inspection des erreurs terminales :

```sql
SELECT tmdb_id, attempts, last_error, updated_at
FROM tmdb_movie_sync_queue
WHERE status = 'dead'
ORDER BY updated_at DESC;
```

Pour relancer manuellement un film après avoir vérifié la cause de l’erreur et son
éligibilité dans les exports récents, cibler explicitement son identifiant :

```sql
BEGIN;

SELECT tmdb_id, status, attempts, consecutive_export_misses, last_error
FROM tmdb_movie_sync_queue
WHERE tmdb_id = 12345
FOR UPDATE;

UPDATE tmdb_movie_sync_queue
SET status = 'retry',
    attempts = 0,
    next_attempt_at = NOW(),
    claimed_at = NULL,
    lease_until = NULL,
    last_error = NULL,
    updated_at = NOW()
WHERE tmdb_id = 12345
  AND status = 'dead'
  AND consecutive_export_misses < 2;

COMMIT;
```

Ne pas réactiver en masse les lignes `dead` et ne pas contourner les limites de
débit. L’utilisation des données et images doit conserver l’attribution TMDB
requise et respecter leurs conditions d’utilisation ainsi que les réponses
`429 Retry-After`.

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
