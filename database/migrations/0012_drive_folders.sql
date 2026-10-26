CREATE TABLE case_folders (
 case_id TEXT PRIMARY KEY REFERENCES cases(id),drive_url TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES officials(id),updated_at TEXT NOT NULL
);
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(11,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
