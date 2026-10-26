CREATE TABLE tags_scoped(code TEXT NOT NULL,label TEXT NOT NULL,group_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,source TEXT NOT NULL DEFAULT 'custom',is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),PRIMARY KEY(code,is_demo));
INSERT INTO tags_scoped(code,label,group_name,active,source,is_demo) SELECT code,label,group_name,active,source,0 FROM tags;
INSERT INTO tags_scoped(code,label,group_name,active,source,is_demo) SELECT code,label,group_name,active,source,1 FROM tags;
DROP TABLE tags;
ALTER TABLE tags_scoped RENAME TO tags;
CREATE INDEX tags_scope ON tags(is_demo,active,group_name,label);
CREATE INDEX institutions_prefix_name ON institutions(is_demo,name COLLATE NOCASE);
CREATE INDEX institutions_prefix_id ON institutions(is_demo,permanent_id COLLATE NOCASE);
CREATE TABLE case_documents(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),uploaded_by TEXT NOT NULL REFERENCES officials(id),
 filename TEXT NOT NULL,content_type TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>0),sha256 TEXT NOT NULL,object_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN('uploading','ready','deleting','deleted')),is_demo INTEGER NOT NULL CHECK(is_demo IN(0,1)),created_at TEXT NOT NULL
);
CREATE INDEX documents_case ON case_documents(case_id,status,created_at);
CREATE INDEX documents_dataset ON case_documents(is_demo,status,created_at);
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(10,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
