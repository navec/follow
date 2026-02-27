SHELL := /bin/bash

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)
DC := HOST_UID=$(HOST_UID) HOST_GID=$(HOST_GID) docker compose
APP_CI := $(DC) run --rm -T -e GITHUB_BASE_SHA -e GITHUB_HEAD_SHA -e MIN_NEW_CODE_COVERAGE app-ci
APP_CI_ROOT := $(DC) run --rm -T --user root app-ci
DEPS_STAMP := .make/deps.stamp

.PHONY: help up down logs ps shell install-hooks ci-draft ci-ready ci-ready-fast ci install deps fix-app-ci-perms lint typecheck build docker-build test-unit test-integration test-coverage db-test-create coverage-gate wait-db

help:
	@echo "Targets:"
	@echo "  make up              # start postgres"
	@echo "  make down            # stop services"
	@echo "  make logs            # postgres logs"
	@echo "  make shell           # shell in app-ci container"
	@echo "  make install-hooks   # active les hooks git versionnés (.githooks)"
	@echo "  make ci-draft        # lint + typecheck + build (PR draft)"
	@echo "  make ci-ready        # ci-draft + unit + integration + coverage (PR ready)"
	@echo "  make ci-ready-fast   # ci-ready sans docker build (itération locale)"
	@echo "  make ci              # alias of ci-ready"
	@echo "  make db-test-create  # create follow_test database from TEST_DATABASE_URL"
	@echo "  make coverage-gate   # run changed-files coverage gate (requires GITHUB_* SHAs)"

up:
	$(DC) up -d postgres

down:
	$(DC) down

logs:
	$(DC) logs -f postgres

ps:
	$(DC) ps

wait-db: up
	@echo "Waiting for postgres to be ready..."
	@for i in $$(seq 1 30); do \
		if $(DC) exec -T postgres pg_isready -U postgres -d follow >/dev/null 2>&1; then \
			echo "Postgres is ready"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "Postgres did not become ready in time"; \
	exit 1

shell: wait-db
	$(DC) run --rm -e GITHUB_BASE_SHA -e GITHUB_HEAD_SHA -e MIN_NEW_CODE_COVERAGE app-ci bash

install-hooks:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	chmod +x .githooks/commit-msg

fix-app-ci-perms: wait-db
	$(APP_CI_ROOT) bash -lc 'mkdir -p /workspace/node_modules && chmod -R a+rX /workspace/node_modules'

deps: fix-app-ci-perms
	@mkdir -p .make
	@current_lock_hash="$$(shasum -a 256 package-lock.json | awk '{print $$1}')"; \
	stored_lock_hash="$$(cat $(DEPS_STAMP) 2>/dev/null || true)"; \
	if [ "$$current_lock_hash" != "$$stored_lock_hash" ]; then \
		echo "Installing dependencies (lockfile changed or first run)..."; \
		$(APP_CI_ROOT) npm ci; \
		echo "$$current_lock_hash" > $(DEPS_STAMP); \
	else \
		if $(APP_CI) bash -lc 'test -d node_modules && test -f node_modules/.package-lock.json'; then \
			echo "Dependencies already installed (lockfile unchanged)"; \
		else \
			echo "Dependencies volume missing, reinstalling..."; \
			$(APP_CI_ROOT) npm ci; \
		fi; \
	fi

install: deps

lint: deps
	$(APP_CI) npm run lint

typecheck: deps
	$(APP_CI) npm run typecheck

build: deps
	$(APP_CI) npm run build

docker-build:
	docker build -t follow-api:local-ci .

db-test-create: deps
	$(APP_CI) npm run db:test:create

test-unit: deps
	$(APP_CI) npm run test:unit

test-integration: deps db-test-create
	$(APP_CI) npm run test:integration

test-coverage: deps db-test-create
	$(APP_CI) npm run test:coverage

coverage-gate: deps db-test-create test-coverage
	$(APP_CI) node scripts/check-changed-files-coverage.mjs

ci-draft: deps lint typecheck build
	$(MAKE) docker-build

ci-ready-fast: deps lint typecheck build test-unit test-integration test-coverage

ci-ready: ci-draft test-unit test-integration test-coverage

ci: ci-ready
