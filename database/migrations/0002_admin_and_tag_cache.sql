CREATE TABLE IF NOT EXISTS workspace_settings (
 is_demo INTEGER PRIMARY KEY CHECK(is_demo IN(0,1)), support_email TEXT NOT NULL DEFAULT '',
 sender_email TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES officials(id)
);
CREATE TABLE IF NOT EXISTS tag_cache (
 cache_key TEXT PRIMARY KEY, suggestions TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tag_cache_expiry ON tag_cache(expires_at);
CREATE TABLE IF NOT EXISTS inference_usage (
 official_id TEXT NOT NULL REFERENCES officials(id), day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(official_id,day)
);
