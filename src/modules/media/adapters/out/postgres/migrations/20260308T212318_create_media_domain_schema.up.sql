-- Up migration
DO $$
BEGIN
  CREATE TYPE work_type AS ENUM ('movie', 'series', 'book', 'manga', 'show');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE contributor_role AS ENUM (
    'actor',
    'director',
    'writer',
    'producer',
    'screenwriter',
    'composer',
    'cinematographer',
    'editor',
    'voice_actor',
    'host',
    'author',
    'illustrator'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE image_type AS ENUM ('poster', 'cover', 'profile', 'backdrop');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE user_work_status AS ENUM ('seen', 'in_progress', 'completed', 'dropped', 'to_read', 'to_watch');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE user_episode_status AS ENUM ('seen', 'in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE relation_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE community_type AS ENUM ('group', 'specific', 'private', 'public');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE community_role AS ENUM ('member', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE recommendation_source_type AS ENUM ('system', 'friend', 'community');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500),
  CONSTRAINT chk_sources_name_nonempty CHECK (char_length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS statuses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  CONSTRAINT chk_statuses_code_nonempty CHECK (char_length(btrim(code)) > 0)
);

CREATE TABLE IF NOT EXISTS locales (
  code VARCHAR(10) PRIMARY KEY,
  language VARCHAR(10) NOT NULL,
  CONSTRAINT chk_locales_code_nonempty CHECK (char_length(btrim(code)) > 0),
  CONSTRAINT chk_locales_language_nonempty CHECK (char_length(btrim(language)) > 0)
);

CREATE TABLE IF NOT EXISTS works (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type work_type NOT NULL,
  release_date DATE,
  status_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_works_status_id
    FOREIGN KEY (status_id) REFERENCES statuses (id)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS source_works (
  source_id BIGINT NOT NULL,
  work_id BIGINT NOT NULL,
  source_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (source_id, work_id),
  UNIQUE (source_id, source_value),
  CONSTRAINT chk_source_works_source_value_nonempty CHECK (char_length(btrim(source_value)) > 0),
  CONSTRAINT fk_source_works_source_id
    FOREIGN KEY (source_id) REFERENCES sources (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_source_works_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_i18n (
  work_id BIGINT NOT NULL,
  locale_code VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  PRIMARY KEY (work_id, locale_code),
  CONSTRAINT chk_work_i18n_title_nonempty CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT fk_work_i18n_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_work_i18n_locale_code
    FOREIGN KEY (locale_code) REFERENCES locales (code)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS contributors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  birth_date DATE,
  CONSTRAINT chk_contributors_name_nonempty CHECK (char_length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS work_contributors (
  work_id BIGINT NOT NULL,
  contributor_id BIGINT NOT NULL,
  role contributor_role NOT NULL,
  PRIMARY KEY (work_id, contributor_id, role),
  CONSTRAINT fk_work_contributors_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_work_contributors_contributor_id
    FOREIGN KEY (contributor_id) REFERENCES contributors (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episodes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id BIGINT NOT NULL,
  episode_number INT NOT NULL,
  season_number INT,
  release_date DATE,
  UNIQUE (work_id, season_number, episode_number),
  CONSTRAINT chk_episodes_episode_number_positive CHECK (episode_number > 0),
  CONSTRAINT chk_episodes_season_number_positive CHECK (season_number IS NULL OR season_number > 0),
  CONSTRAINT fk_episodes_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_i18n (
  episode_id BIGINT NOT NULL,
  locale_code VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  PRIMARY KEY (episode_id, locale_code),
  CONSTRAINT chk_episode_i18n_title_nonempty CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT fk_episode_i18n_episode_id
    FOREIGN KEY (episode_id) REFERENCES episodes (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_episode_i18n_locale_code
    FOREIGN KEY (locale_code) REFERENCES locales (code)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type image_type,
  url VARCHAR(500) NOT NULL,
  locale_code VARCHAR(10),
  CONSTRAINT chk_images_url_nonempty CHECK (char_length(btrim(url)) > 0),
  CONSTRAINT fk_images_locale_code
    FOREIGN KEY (locale_code) REFERENCES locales (code)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS source_images (
  source_id BIGINT NOT NULL,
  image_id BIGINT NOT NULL,
  source_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (source_id, image_id),
  UNIQUE (source_id, source_value),
  CONSTRAINT chk_source_images_source_value_nonempty CHECK (char_length(btrim(source_value)) > 0),
  CONSTRAINT fk_source_images_source_id
    FOREIGN KEY (source_id) REFERENCES sources (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_source_images_image_id
    FOREIGN KEY (image_id) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_images (
  work_id BIGINT NOT NULL,
  image_id BIGINT NOT NULL,
  PRIMARY KEY (work_id, image_id),
  CONSTRAINT fk_work_images_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_work_images_image_id
    FOREIGN KEY (image_id) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contributor_images (
  contributor_id BIGINT NOT NULL,
  image_id BIGINT NOT NULL,
  PRIMARY KEY (contributor_id, image_id),
  CONSTRAINT fk_contributor_images_contributor_id
    FOREIGN KEY (contributor_id) REFERENCES contributors (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_contributor_images_image_id
    FOREIGN KEY (image_id) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episode_images (
  episode_id BIGINT NOT NULL,
  image_id BIGINT NOT NULL,
  PRIMARY KEY (episode_id, image_id),
  CONSTRAINT fk_episode_images_episode_id
    FOREIGN KEY (episode_id) REFERENCES episodes (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_episode_images_image_id
    FOREIGN KEY (image_id) REFERENCES images (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY,
  locale_code VARCHAR(10),
  CONSTRAINT fk_user_preferences_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_preferences_locale_code
    FOREIGN KEY (locale_code) REFERENCES locales (code)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_works (
  user_id UUID NOT NULL,
  work_id BIGINT NOT NULL,
  status user_work_status NOT NULL,
  rating NUMERIC(3, 1),
  favorite BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, work_id),
  CONSTRAINT chk_user_works_rating CHECK (rating IS NULL OR (rating >= 0.0 AND rating <= 10.0)),
  CONSTRAINT chk_user_works_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_user_works_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_works_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_episodes (
  user_id UUID NOT NULL,
  episode_id BIGINT NOT NULL,
  status user_episode_status NOT NULL,
  rating NUMERIC(3, 1),
  watched_date DATE,
  PRIMARY KEY (user_id, episode_id),
  CONSTRAINT chk_user_episodes_rating CHECK (rating IS NULL OR (rating >= 0.0 AND rating <= 10.0)),
  CONSTRAINT fk_user_episodes_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_episodes_episode_id
    FOREIGN KEY (episode_id) REFERENCES episodes (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_relations (
  user_id UUID NOT NULL,
  related_user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  status relation_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, related_user_id, type),
  CONSTRAINT chk_user_relations_not_self CHECK (user_id <> related_user_id),
  CONSTRAINT chk_user_relations_type_nonempty CHECK (char_length(btrim(type)) > 0),
  CONSTRAINT fk_user_relations_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_relations_related_user_id
    FOREIGN KEY (related_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type community_type NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_communities_name_nonempty CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT fk_communities_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS community_users (
  community_id BIGINT NOT NULL,
  user_id UUID NOT NULL,
  role community_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id),
  CONSTRAINT fk_community_users_community_id
    FOREIGN KEY (community_id) REFERENCES communities (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_community_users_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_recommendations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  work_id BIGINT NOT NULL,
  source_type recommendation_source_type NOT NULL,
  source_id BIGINT,
  score NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_work_recommendations_score CHECK (score IS NULL OR (score >= 0.00 AND score <= 100.00)),
  CONSTRAINT chk_work_recommendations_source_id CHECK (
    (source_type = 'system' AND source_id IS NULL) OR
    (source_type IN ('friend', 'community') AND source_id IS NOT NULL)
  ),
  CONSTRAINT fk_work_recommendations_user_id
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_work_recommendations_work_id
    FOREIGN KEY (work_id) REFERENCES works (id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

