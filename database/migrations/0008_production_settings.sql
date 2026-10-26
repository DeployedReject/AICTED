ALTER TABLE officials ADD COLUMN email TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX officials_email ON officials(is_demo,email) WHERE email<>'';
CREATE TABLE runtime_settings(
 is_demo INTEGER PRIMARY KEY CHECK(is_demo IN(0,1)),site_name TEXT NOT NULL DEFAULT 'AICTE',public_url TEXT NOT NULL DEFAULT '',
 support_email TEXT NOT NULL DEFAULT '',provider TEXT NOT NULL DEFAULT 'resend' CHECK(provider IN('resend','sendgrid')),
 sender_name TEXT NOT NULL DEFAULT 'AICTE',recovery_sender TEXT NOT NULL DEFAULT '',updates_sender TEXT NOT NULL DEFAULT '',reply_to TEXT NOT NULL DEFAULT '',
 recovery_enabled INTEGER NOT NULL DEFAULT 0,updates_enabled INTEGER NOT NULL DEFAULT 0,reminders_enabled INTEGER NOT NULL DEFAULT 0,
 daily_email_limit INTEGER NOT NULL DEFAULT 100,reminder_days INTEGER NOT NULL DEFAULT 3,session_hours INTEGER NOT NULL DEFAULT 8,
 updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES officials(id)
);
CREATE TABLE secret_store(is_demo INTEGER NOT NULL,name TEXT NOT NULL,ciphertext TEXT NOT NULL,last_four TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES officials(id),PRIMARY KEY(is_demo,name));
CREATE TABLE admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES officials(id),action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,is_demo INTEGER NOT NULL);
CREATE INDEX admin_audit_scope ON admin_audit(is_demo,created_at DESC);
CREATE TRIGGER admin_audit_immutable_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit history is append-only');END;
CREATE TRIGGER admin_audit_immutable_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit history is append-only');END;
CREATE TABLE password_resets(token_hash TEXT PRIMARY KEY,official_id TEXT NOT NULL REFERENCES officials(id),expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX password_resets_official ON password_resets(official_id,expires_at);
CREATE TABLE recovery_usage(official_id TEXT NOT NULL REFERENCES officials(id),day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(official_id,day));
CREATE TABLE mail_daily(day TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE notification_outbox(id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES officials(id),case_id TEXT REFERENCES cases(id),event_id TEXT REFERENCES case_events(id),kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX notification_pending ON notification_outbox(status,created_at);
CREATE TRIGGER case_event_mail AFTER INSERT ON case_events WHEN NEW.kind<>'comment' BEGIN
 INSERT OR IGNORE INTO notification_outbox(id,recipient_id,case_id,event_id,kind,created_at,updated_at)
 SELECT 'mail-'||NEW.id,c.assigned_to,c.id,NEW.id,'update',NEW.created_at,NEW.created_at
 FROM cases c JOIN officials o ON o.id=c.assigned_to JOIN runtime_settings r ON r.is_demo=0
 WHERE c.id=NEW.case_id AND c.is_demo=0 AND o.active=1 AND o.email<>'' AND r.updates_enabled=1;
END;

CREATE TABLE production_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1), completed_at TEXT NOT NULL);
