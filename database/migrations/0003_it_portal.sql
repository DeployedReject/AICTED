ALTER TABLE sessions ADD COLUMN portal TEXT NOT NULL DEFAULT 'official' CHECK(portal IN('official','it'));
CREATE TABLE IF NOT EXISTS migration_settings (
 is_demo INTEGER PRIMARY KEY CHECK(is_demo IN(0,1)), host TEXT NOT NULL DEFAULT '',
 port INTEGER NOT NULL DEFAULT 5432, database_name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '',
 ssl_mode TEXT NOT NULL DEFAULT 'verify-full', updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES officials(id)
);
