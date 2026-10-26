CREATE TABLE institution_password_resets(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES institution_accounts(id),expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX institution_resets_account ON institution_password_resets(account_id,expires_at);
CREATE TABLE institution_recovery_usage(account_id TEXT NOT NULL REFERENCES institution_accounts(id),day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,day));
CREATE INDEX event_responsible_time ON case_events(case_assigned_snapshot,kind,created_at);
CREATE INDEX event_actor_time ON case_events(actor_id,kind,created_at);
CREATE INDEX event_bureau_time ON case_events(case_bureau_snapshot,kind,created_at);
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(15,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
