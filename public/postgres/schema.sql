-- AICTED PostgreSQL 16+ live application schema, version 10.
BEGIN;
-- Compatible application schema. Connection registry and IT recovery remain in the original D1.

CREATE TABLE officials (
 id TEXT COLLATE "C" PRIMARY KEY,name TEXT COLLATE "C" NOT NULL,designation TEXT COLLATE "C" NOT NULL,bureau TEXT COLLATE "C" NOT NULL,
 role TEXT COLLATE "C" NOT NULL CHECK(role IN('official','manager','it')),manager_id TEXT COLLATE "C" REFERENCES officials(id),
 is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),active SMALLINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 password_hash TEXT COLLATE "C",password_salt TEXT COLLATE "C",report_scope TEXT COLLATE "C" NOT NULL DEFAULT 'personal' CHECK(report_scope IN('personal','team','bureau')),email TEXT COLLATE "C" NOT NULL DEFAULT ''
);
CREATE INDEX officials_manager ON officials(manager_id,is_demo);
CREATE INDEX officials_directory_fts ON officials USING GIN(to_tsvector('simple',name || ' ' || id || ' ' || designation || ' ' || bureau));
CREATE TABLE sessions(token_hash TEXT COLLATE "C" PRIMARY KEY,official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),expires_at BIGINT NOT NULL,portal TEXT COLLATE "C" NOT NULL DEFAULT 'official' CHECK(portal IN('official','it')));
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_official ON sessions(official_id,expires_at);
CREATE TABLE institutions(id TEXT COLLATE "C" PRIMARY KEY,name TEXT COLLATE "C" NOT NULL,permanent_id TEXT COLLATE "C" NOT NULL UNIQUE,city TEXT COLLATE "C" NOT NULL,state TEXT COLLATE "C" NOT NULL,region TEXT COLLATE "C" NOT NULL,is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)));
CREATE INDEX institution_search ON institutions(is_demo,name);
CREATE TABLE tags(code TEXT COLLATE "C" NOT NULL,label TEXT COLLATE "C" NOT NULL,group_name TEXT COLLATE "C" NOT NULL,active SMALLINT NOT NULL DEFAULT 1,source TEXT COLLATE "C" NOT NULL DEFAULT 'reference',is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),PRIMARY KEY(code,is_demo));
CREATE TABLE cases(
 id TEXT COLLATE "C" PRIMARY KEY,subject TEXT COLLATE "C" NOT NULL,institution_id TEXT COLLATE "C" NOT NULL REFERENCES institutions(id),bureau TEXT COLLATE "C" NOT NULL,
 assigned_to TEXT COLLATE "C" NOT NULL REFERENCES officials(id),created_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id),
 status TEXT COLLATE "C" NOT NULL CHECK(status IN('Pending','Under process','Awaiting information','Disposed')),
 intake TEXT COLLATE "C" NOT NULL CHECK(intake IN('Submitted','Approved','Returned','Rejected')),
 escalated SMALLINT NOT NULL DEFAULT 0 CHECK(escalated IN(0,1)),priority TEXT COLLATE "C" NOT NULL DEFAULT 'Routine',
 tags TEXT COLLATE "C" NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tags::jsonb)='array'),description TEXT COLLATE "C" NOT NULL,next_action TEXT COLLATE "C" NOT NULL,
 received_at TEXT COLLATE "C" NOT NULL,due_at TEXT COLLATE "C" NOT NULL,updated_at TEXT COLLATE "C" NOT NULL,
 is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)),approval_reason TEXT COLLATE "C" NOT NULL DEFAULT ''
);
CREATE INDEX cases_assigned ON cases(is_demo,assigned_to,intake,updated_at DESC,id);
CREATE INDEX cases_institution ON cases(is_demo,institution_id,intake,status);
CREATE INDEX cases_created ON cases(is_demo,created_by,intake);
CREATE INDEX cases_bureau ON cases(is_demo,bureau,intake,updated_at DESC);
CREATE INDEX cases_tags ON cases USING GIN((tags::jsonb));
CREATE TABLE case_events(id TEXT COLLATE "C" PRIMARY KEY,case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),kind TEXT COLLATE "C" NOT NULL,actor_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),body TEXT COLLATE "C" NOT NULL,created_at TEXT COLLATE "C" NOT NULL);
CREATE INDEX events_case ON case_events(case_id,created_at,id);
CREATE OR REPLACE FUNCTION immutable_case_events() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Case history is append-only'; END; $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON case_events FOR EACH ROW EXECUTE FUNCTION immutable_case_events();
CREATE TABLE case_grants(case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),granted_at TEXT COLLATE "C" NOT NULL,revoked_at TEXT COLLATE "C",PRIMARY KEY(case_id,official_id));
CREATE INDEX grants_official ON case_grants(official_id,revoked_at,case_id);
CREATE TABLE coordination_requests(id TEXT COLLATE "C" PRIMARY KEY,case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),requester_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),target_official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),target_bureau TEXT COLLATE "C" NOT NULL,status TEXT COLLATE "C" NOT NULL CHECK(status IN('Awaiting manager','Awaiting Bureau','Approved','Rejected','Revoked')),reason TEXT COLLATE "C" NOT NULL,manager_approved_at TEXT COLLATE "C",bureau_approved_at TEXT COLLATE "C",created_at TEXT COLLATE "C" NOT NULL);
CREATE INDEX coordination_case ON coordination_requests(case_id,created_at);
CREATE INDEX coordination_target ON coordination_requests(target_official_id,status);
CREATE UNIQUE INDEX coordination_open ON coordination_requests(case_id,target_official_id) WHERE status IN('Awaiting manager','Awaiting Bureau','Approved');
CREATE TABLE messages(id TEXT COLLATE "C" PRIMARY KEY,sender_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),recipient_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),case_id TEXT COLLATE "C" REFERENCES cases(id),body TEXT COLLATE "C" NOT NULL,created_at TEXT COLLATE "C" NOT NULL,read_at TEXT COLLATE "C",is_demo SMALLINT NOT NULL DEFAULT 0 CHECK(is_demo IN(0,1)));
CREATE INDEX messages_recipient ON messages(is_demo,recipient_id,created_at DESC);
CREATE INDEX messages_sender ON messages(is_demo,sender_id,created_at DESC);
CREATE TABLE workspace_settings(is_demo SMALLINT PRIMARY KEY CHECK(is_demo IN(0,1)),support_email TEXT COLLATE "C" NOT NULL DEFAULT '',sender_email TEXT COLLATE "C" NOT NULL DEFAULT '',updated_at TEXT COLLATE "C" NOT NULL,updated_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id));
CREATE TABLE migration_settings(source TEXT COLLATE "C" NOT NULL DEFAULT 'postgres' CHECK(source IN('d1','postgres')),d1_database_id TEXT COLLATE "C" NOT NULL DEFAULT '',is_demo SMALLINT PRIMARY KEY CHECK(is_demo IN(0,1)),host TEXT COLLATE "C" NOT NULL DEFAULT '',port INTEGER NOT NULL DEFAULT 5432 CHECK(port BETWEEN 1 AND 65535),database_name TEXT COLLATE "C" NOT NULL DEFAULT '',username TEXT COLLATE "C" NOT NULL DEFAULT '',ssl_mode TEXT COLLATE "C" NOT NULL DEFAULT 'verify-full',updated_at TEXT COLLATE "C" NOT NULL,updated_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id));
CREATE TABLE tag_cache(cache_key TEXT COLLATE "C" PRIMARY KEY,suggestions TEXT COLLATE "C" NOT NULL,expires_at BIGINT NOT NULL);
CREATE INDEX tag_cache_expiry ON tag_cache(expires_at);
CREATE TABLE inference_usage(official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),day TEXT COLLATE "C" NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(official_id,day));


CREATE UNIQUE INDEX officials_email ON officials(is_demo,email) WHERE email<>'';
CREATE TABLE org_units(code TEXT COLLATE "C" PRIMARY KEY,name TEXT COLLATE "C" NOT NULL,unit_type TEXT COLLATE "C" NOT NULL,active SMALLINT NOT NULL DEFAULT 1,verification TEXT COLLATE "C" NOT NULL DEFAULT 'unverified',source TEXT COLLATE "C" NOT NULL DEFAULT 'Reference/AICTE_Dashboard_Reference_Spec.md');

CREATE TABLE case_relations (
 case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),related_case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),
 kind TEXT COLLATE "C" NOT NULL CHECK(kind IN('Related','Duplicate','Unrelated')),reason TEXT COLLATE "C" NOT NULL,
 created_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id),created_at TEXT COLLATE "C" NOT NULL,
 PRIMARY KEY(case_id,related_case_id),CHECK(case_id<related_case_id)
);
CREATE INDEX relations_other ON case_relations(related_case_id,case_id);
CREATE INDEX events_kind_case ON case_events(case_id,kind,created_at DESC);
CREATE INDEX cases_deadline ON cases(is_demo,intake,status,due_at);

CREATE TABLE runtime_settings(
 is_demo INTEGER PRIMARY KEY CHECK(is_demo IN(0,1)),site_name TEXT COLLATE "C" NOT NULL DEFAULT 'AICTE',public_url TEXT COLLATE "C" NOT NULL DEFAULT '',
 support_email TEXT COLLATE "C" NOT NULL DEFAULT '',provider TEXT COLLATE "C" NOT NULL DEFAULT 'resend' CHECK(provider IN('resend','sendgrid')),
 sender_name TEXT COLLATE "C" NOT NULL DEFAULT 'AICTE',recovery_sender TEXT COLLATE "C" NOT NULL DEFAULT '',updates_sender TEXT COLLATE "C" NOT NULL DEFAULT '',reply_to TEXT COLLATE "C" NOT NULL DEFAULT '',
 recovery_enabled INTEGER NOT NULL DEFAULT 0,updates_enabled INTEGER NOT NULL DEFAULT 0,reminders_enabled INTEGER NOT NULL DEFAULT 0,
 daily_email_limit INTEGER NOT NULL DEFAULT 100,reminder_days INTEGER NOT NULL DEFAULT 3,session_hours INTEGER NOT NULL DEFAULT 8,
 updated_at TEXT COLLATE "C" NOT NULL,updated_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id)
);
CREATE TABLE secret_store(is_demo INTEGER NOT NULL,name TEXT COLLATE "C" NOT NULL,ciphertext TEXT COLLATE "C" NOT NULL,last_four TEXT COLLATE "C" NOT NULL,updated_at TEXT COLLATE "C" NOT NULL,updated_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id),PRIMARY KEY(is_demo,name));
CREATE TABLE admin_audit(id TEXT COLLATE "C" PRIMARY KEY,actor_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),action TEXT COLLATE "C" NOT NULL,detail TEXT COLLATE "C" NOT NULL,created_at TEXT COLLATE "C" NOT NULL,is_demo INTEGER NOT NULL);
CREATE INDEX admin_audit_scope ON admin_audit(is_demo,created_at DESC);
CREATE OR REPLACE FUNCTION immutable_admin_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is append-only'; END; $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON admin_audit FOR EACH ROW EXECUTE FUNCTION immutable_admin_audit();
CREATE TABLE password_resets(token_hash TEXT COLLATE "C" PRIMARY KEY,official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX password_resets_official ON password_resets(official_id,expires_at);
CREATE TABLE recovery_usage(official_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),day TEXT COLLATE "C" NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(official_id,day));
CREATE TABLE mail_daily(day TEXT COLLATE "C" PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE notification_outbox(id TEXT COLLATE "C" PRIMARY KEY,recipient_id TEXT COLLATE "C" NOT NULL REFERENCES officials(id),case_id TEXT COLLATE "C" REFERENCES cases(id),event_id TEXT COLLATE "C" REFERENCES case_events(id),kind TEXT COLLATE "C" NOT NULL,status TEXT COLLATE "C" NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT COLLATE "C" NOT NULL DEFAULT '',created_at TEXT COLLATE "C" NOT NULL,updated_at TEXT COLLATE "C" NOT NULL);
CREATE INDEX notification_pending ON notification_outbox(status,created_at);
CREATE TABLE production_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1), completed_at TEXT COLLATE "C" NOT NULL);



CREATE OR REPLACE FUNCTION json_each(input TEXT) RETURNS TABLE(value TEXT) LANGUAGE SQL IMMUTABLE AS $$ SELECT jsonb_array_elements_text(input::jsonb); $$;
CREATE OR REPLACE FUNCTION min(a TEXT,b TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$ SELECT LEAST(a,b); $$;
CREATE OR REPLACE FUNCTION max(a TEXT,b TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$ SELECT GREATEST(a,b); $$;
CREATE INDEX tags_scope ON tags(is_demo,active,group_name,label);
CREATE INDEX institutions_prefix_name ON institutions(is_demo,lower(name));
CREATE INDEX institutions_prefix_id ON institutions(is_demo,lower(permanent_id));
CREATE TABLE case_documents(
 id TEXT COLLATE "C" PRIMARY KEY,case_id TEXT COLLATE "C" NOT NULL REFERENCES cases(id),
 uploaded_by TEXT COLLATE "C" NOT NULL REFERENCES officials(id),filename TEXT COLLATE "C" NOT NULL,
 content_type TEXT COLLATE "C" NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>0),sha256 TEXT COLLATE "C" NOT NULL,
 object_key TEXT COLLATE "C" NOT NULL UNIQUE,status TEXT COLLATE "C" NOT NULL CHECK(status IN('uploading','ready','deleting','deleted')),
 is_demo INTEGER NOT NULL CHECK(is_demo IN(0,1)),created_at TEXT COLLATE "C" NOT NULL
);
CREATE INDEX documents_case ON case_documents(case_id,status,created_at);
CREATE INDEX documents_dataset ON case_documents(is_demo,status,created_at);
CREATE TABLE app_schema(version INTEGER PRIMARY KEY,applied_at TEXT COLLATE "C" NOT NULL);
INSERT INTO app_schema VALUES(10,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
CREATE OR REPLACE FUNCTION enqueue_case_mail() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO notification_outbox(id,recipient_id,case_id,event_id,kind,created_at,updated_at)
 SELECT 'mail-'||NEW.id,c.assigned_to,c.id,NEW.id,'update',NEW.created_at,NEW.created_at
 FROM cases c JOIN officials o ON o.id=c.assigned_to JOIN runtime_settings r ON r.is_demo=0
 WHERE c.id=NEW.case_id AND c.is_demo=0 AND o.active=1 AND o.email<>'' AND r.updates_enabled=1 AND NEW.kind<>'comment'
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
CREATE TRIGGER case_event_mail AFTER INSERT ON case_events FOR EACH ROW EXECUTE FUNCTION enqueue_case_mail();

COMMIT;
