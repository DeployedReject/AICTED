ALTER TABLE officials ADD COLUMN report_scope TEXT NOT NULL DEFAULT 'personal' CHECK(report_scope IN('personal','team','bureau'));
UPDATE officials SET report_scope='team' WHERE role='manager';
DELETE FROM sessions WHERE official_id='0000' OR portal='it';
CREATE TABLE app_schema(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
INSERT INTO app_schema VALUES(9,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
