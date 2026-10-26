ALTER TABLE institutions ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN district TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN aishe_code TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
CREATE TABLE institution_accounts(
 id TEXT PRIMARY KEY,institution_id TEXT NOT NULL REFERENCES institutions(id),name TEXT NOT NULL,email TEXT NOT NULL,
 password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,is_demo INTEGER NOT NULL CHECK(is_demo IN(0,1)),created_at TEXT NOT NULL
);
CREATE INDEX institution_accounts_scope ON institution_accounts(is_demo,institution_id,active);
CREATE TABLE institution_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES institution_accounts(id),expires_at INTEGER NOT NULL);
CREATE INDEX institution_session_account ON institution_sessions(account_id,expires_at);
CREATE TABLE institution_routing(is_demo INTEGER NOT NULL,bureau TEXT NOT NULL,approver_id TEXT NOT NULL REFERENCES officials(id),PRIMARY KEY(is_demo,bureau));
ALTER TABLE case_folders ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN(0,1));
ALTER TABLE cases ADD COLUMN institution_account_id TEXT REFERENCES institution_accounts(id);
ALTER TABLE cases ADD COLUMN cancellation_state TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN institution_escalation TEXT NOT NULL DEFAULT '';
CREATE INDEX cases_institution_received ON cases(is_demo,institution_id,received_at,id);
CREATE TABLE institution_events(
 id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),account_id TEXT NOT NULL REFERENCES institution_accounts(id),kind TEXT NOT NULL,
 body TEXT NOT NULL,created_at TEXT NOT NULL,actor_name TEXT NOT NULL,rating INTEGER
);
CREATE INDEX institution_events_case ON institution_events(case_id,created_at,id);
CREATE UNIQUE INDEX institution_single_review ON institution_events(case_id,account_id,kind) WHERE kind='review';
CREATE TRIGGER institution_history_update BEFORE UPDATE ON institution_events BEGIN SELECT RAISE(ABORT,'Institution history is append-only');END;
CREATE TRIGGER institution_history_delete BEFORE DELETE ON institution_events BEGIN SELECT RAISE(ABORT,'Institution history is append-only');END;
DROP TRIGGER immutable_events_update;
ALTER TABLE case_events ADD COLUMN actor_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE case_events ADD COLUMN actor_bureau_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE case_events ADD COLUMN actor_designation_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE case_events ADD COLUMN case_status_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE case_events ADD COLUMN case_bureau_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE case_events ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN(0,1));
UPDATE case_events SET actor_name_snapshot=actor_id,actor_bureau_snapshot='Not recorded',actor_designation_snapshot='Legacy event';
CREATE TRIGGER immutable_events_update BEFORE UPDATE ON case_events WHEN NOT(
 OLD.actor_name_snapshot='' AND OLD.actor_bureau_snapshot='' AND OLD.actor_designation_snapshot='' AND
 NEW.id=OLD.id AND NEW.case_id=OLD.case_id AND NEW.kind=OLD.kind AND NEW.actor_id=OLD.actor_id AND NEW.body=OLD.body AND NEW.created_at=OLD.created_at AND NEW.is_public=OLD.is_public AND
 NEW.actor_name_snapshot=(SELECT name FROM officials WHERE id=OLD.actor_id) AND NEW.actor_bureau_snapshot=(SELECT bureau FROM officials WHERE id=OLD.actor_id) AND NEW.actor_designation_snapshot=(SELECT designation FROM officials WHERE id=OLD.actor_id) AND
 NEW.case_status_snapshot=(SELECT status FROM cases WHERE id=OLD.case_id) AND NEW.case_bureau_snapshot=(SELECT bureau FROM cases WHERE id=OLD.case_id)
) BEGIN SELECT RAISE(ABORT,'Case history is append-only');END;
CREATE TRIGGER event_actor_snapshot AFTER INSERT ON case_events WHEN NEW.actor_name_snapshot='' BEGIN
 UPDATE case_events SET actor_name_snapshot=(SELECT name FROM officials WHERE id=NEW.actor_id),actor_bureau_snapshot=(SELECT bureau FROM officials WHERE id=NEW.actor_id),actor_designation_snapshot=(SELECT designation FROM officials WHERE id=NEW.actor_id),case_status_snapshot=(SELECT status FROM cases WHERE id=NEW.case_id),case_bureau_snapshot=(SELECT bureau FROM cases WHERE id=NEW.case_id) WHERE id=NEW.id;
END;
CREATE TABLE handoff_requests(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),requester_id TEXT NOT NULL REFERENCES officials(id),target_id TEXT NOT NULL REFERENCES officials(id),source_bureau TEXT NOT NULL,target_bureau TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Awaiting receiving manager',reason TEXT NOT NULL,created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT REFERENCES officials(id));
CREATE INDEX handoff_scope ON handoff_requests(target_bureau,status,created_at);
CREATE UNIQUE INDEX handoff_open ON handoff_requests(case_id) WHERE status='Awaiting receiving manager';
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(12,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
