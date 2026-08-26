CREATE TABLE tmdb_movie_sync_queue (
  tmdb_id BIGINT PRIMARY KEY,
  popularity DOUBLE PRECISION NOT NULL CHECK (popularity >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'retry', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  last_seen_export_date DATE NOT NULL,
  consecutive_export_misses INTEGER NOT NULL DEFAULT 0
    CHECK (consecutive_export_misses >= 0),
  last_hydrated_at TIMESTAMPTZ,
  refresh_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tmdb_movie_sync_queue_claim
  ON tmdb_movie_sync_queue (popularity DESC, next_attempt_at, tmdb_id)
  WHERE status IN ('pending', 'retry');

CREATE INDEX idx_tmdb_movie_sync_queue_expired_lease
  ON tmdb_movie_sync_queue (lease_until)
  WHERE status = 'processing';

CREATE TABLE tmdb_movie_inventory_staging (
  export_date DATE NOT NULL,
  tmdb_id BIGINT NOT NULL,
  popularity DOUBLE PRECISION NOT NULL CHECK (popularity >= 0),
  PRIMARY KEY (export_date, tmdb_id)
);

CREATE TABLE tmdb_catalog_sync_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  last_completed_export_date DATE,
  last_completed_changes_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tmdb_catalog_sync_state (singleton) VALUES (TRUE);
