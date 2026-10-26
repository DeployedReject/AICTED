CREATE TABLE case_notices(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),official_id TEXT NOT NULL REFERENCES officials(id),kind TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT);
CREATE INDEX notices_official ON case_notices(official_id,created_at DESC,id);
CREATE INDEX notices_unread ON case_notices(official_id,read_at);
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(13,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
