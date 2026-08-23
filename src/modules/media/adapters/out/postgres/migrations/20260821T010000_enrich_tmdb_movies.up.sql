ALTER TABLE works
  ADD COLUMN original_title VARCHAR(255),
  ADD COLUMN original_language VARCHAR(10);

ALTER TABLE work_i18n
  ADD COLUMN tagline VARCHAR(500);

ALTER TABLE work_contributors
  ADD COLUMN character_name VARCHAR(255);

CREATE TABLE source_contributors (
  source_id BIGINT NOT NULL,
  contributor_id BIGINT NOT NULL,
  source_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (source_id, contributor_id),
  UNIQUE (source_id, source_value),
  CONSTRAINT chk_source_contributors_source_value_nonempty
    CHECK (char_length(btrim(source_value)) > 0),
  CONSTRAINT fk_source_contributors_source_id
    FOREIGN KEY (source_id) REFERENCES sources (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_source_contributors_contributor_id
    FOREIGN KEY (contributor_id) REFERENCES contributors (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
