-- Refuse to guess how duplicated providers should be merged. The conflicting
-- rows and their source mappings must be reviewed before applying this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sources
    GROUP BY name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique source names: duplicate sources exist';
  END IF;
END $$;

ALTER TABLE sources
  ADD CONSTRAINT uq_sources_name UNIQUE (name);
