DROP INDEX IF EXISTS users_email_unique_idx;
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
