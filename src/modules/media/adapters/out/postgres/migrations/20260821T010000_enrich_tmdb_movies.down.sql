DROP TABLE IF EXISTS source_contributors;

ALTER TABLE work_contributors
  DROP COLUMN IF EXISTS character_name;

ALTER TABLE work_i18n
  DROP COLUMN IF EXISTS tagline;

ALTER TABLE works
  DROP COLUMN IF EXISTS original_language,
  DROP COLUMN IF EXISTS original_title;
