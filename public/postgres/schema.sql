-- AICTED target schema, PostgreSQL 16+. Preparation only; D1 remains active.
BEGIN;
CREATE TABLE officials (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,designation TEXT NOT NULL,bureau TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('official','manager','it')),manager_id TEXT REFERENCES officials(id),
 is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),active SMALLINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 password_hash TEXT,password_salt TEXT
);
CREATE INDEX officials_manager ON officials(manager_id,is_demo);
CREATE INDEX officials_directory_fts ON officials USING GIN(to_tsvector('simple',name || ' ' || id || ' ' || designation || ' ' || bureau));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,official_id TEXT NOT NULL REFERENCES officials(id),expires_at BIGINT NOT NULL,portal TEXT NOT NULL DEFAULT 'official' CHECK(portal IN('official','it')));
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_official ON sessions(official_id,expires_at);
CREATE TABLE institutions(id TEXT PRIMARY KEY,name TEXT NOT NULL,permanent_id TEXT NOT NULL UNIQUE,city TEXT NOT NULL,state TEXT NOT NULL,region TEXT NOT NULL,is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)));
CREATE INDEX institution_search ON institutions(is_demo,name);
CREATE TABLE tags(code TEXT PRIMARY KEY,label TEXT NOT NULL,group_name TEXT NOT NULL);
CREATE TABLE cases(
 id TEXT PRIMARY KEY,subject TEXT NOT NULL,institution_id TEXT NOT NULL REFERENCES institutions(id),bureau TEXT NOT NULL,
 assigned_to TEXT NOT NULL REFERENCES officials(id),created_by TEXT NOT NULL REFERENCES officials(id),
 status TEXT NOT NULL CHECK(status IN('Pending','Under process','Awaiting information','Disposed')),
 intake TEXT NOT NULL CHECK(intake IN('Submitted','Approved','Returned','Rejected')),
 escalated SMALLINT NOT NULL DEFAULT 0 CHECK(escalated IN(0,1)),priority TEXT NOT NULL DEFAULT 'Routine',
 tags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(tags)='array'),description TEXT NOT NULL,next_action TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL,due_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL,
 is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),approval_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX cases_assigned ON cases(is_demo,assigned_to,intake,updated_at DESC,id);
CREATE INDEX cases_institution ON cases(is_demo,institution_id,intake,status);
CREATE INDEX cases_created ON cases(is_demo,created_by,intake);
CREATE INDEX cases_bureau ON cases(is_demo,bureau,intake,updated_at DESC);
CREATE INDEX cases_tags ON cases USING GIN(tags);
CREATE TABLE case_events(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),kind TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES officials(id),body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL);
CREATE INDEX events_case ON case_events(case_id,created_at,id);
CREATE FUNCTION immutable_case_events() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Case history is append-only'; END; $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON case_events FOR EACH ROW EXECUTE FUNCTION immutable_case_events();
CREATE TABLE case_grants(case_id TEXT NOT NULL REFERENCES cases(id),official_id TEXT NOT NULL REFERENCES officials(id),granted_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,PRIMARY KEY(case_id,official_id));
CREATE INDEX grants_official ON case_grants(official_id,revoked_at,case_id);
CREATE TABLE coordination_requests(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),requester_id TEXT NOT NULL REFERENCES officials(id),target_official_id TEXT NOT NULL REFERENCES officials(id),target_bureau TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('Awaiting manager','Awaiting Bureau','Approved','Rejected','Revoked')),reason TEXT NOT NULL,manager_approved_at TIMESTAMPTZ,bureau_approved_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL);
CREATE INDEX coordination_case ON coordination_requests(case_id,created_at);
CREATE INDEX coordination_target ON coordination_requests(target_official_id,status);
CREATE UNIQUE INDEX coordination_open ON coordination_requests(case_id,target_official_id) WHERE status IN('Awaiting manager','Awaiting Bureau','Approved');
CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES officials(id),recipient_id TEXT NOT NULL REFERENCES officials(id),case_id TEXT REFERENCES cases(id),body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL,read_at TIMESTAMPTZ,is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)));
CREATE INDEX messages_recipient ON messages(is_demo,recipient_id,created_at DESC);
CREATE INDEX messages_sender ON messages(is_demo,sender_id,created_at DESC);
CREATE TABLE workspace_settings(is_demo SMALLINT PRIMARY KEY CHECK(is_demo IN(0,1)),support_email TEXT NOT NULL DEFAULT '',sender_email TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL,updated_by TEXT NOT NULL REFERENCES officials(id));
CREATE TABLE migration_settings(source TEXT NOT NULL DEFAULT 'postgres' CHECK(source IN('d1','postgres')),d1_database_id TEXT NOT NULL DEFAULT '',is_demo SMALLINT PRIMARY KEY CHECK(is_demo IN(0,1)),host TEXT NOT NULL DEFAULT '',port INTEGER NOT NULL DEFAULT 5432 CHECK(port BETWEEN 1 AND 65535),database_name TEXT NOT NULL DEFAULT '',username TEXT NOT NULL DEFAULT '',ssl_mode TEXT NOT NULL DEFAULT 'verify-full',updated_at TIMESTAMPTZ NOT NULL,updated_by TEXT NOT NULL REFERENCES officials(id));
CREATE TABLE tag_cache(cache_key TEXT PRIMARY KEY,suggestions JSONB NOT NULL,expires_at BIGINT NOT NULL);
CREATE INDEX tag_cache_expiry ON tag_cache(expires_at);
CREATE TABLE inference_usage(official_id TEXT NOT NULL REFERENCES officials(id),day DATE NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(official_id,day));
COMMIT;
