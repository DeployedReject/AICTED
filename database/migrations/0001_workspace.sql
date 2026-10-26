PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS officials (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, designation TEXT NOT NULL, bureau TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('official','manager','it')), manager_id TEXT REFERENCES officials(id),
 is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)), active INTEGER NOT NULL DEFAULT 1,
 password_hash TEXT, password_salt TEXT
);
CREATE INDEX IF NOT EXISTS officials_manager ON officials(manager_id, is_demo);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, official_id TEXT NOT NULL REFERENCES officials(id), expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS institutions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, permanent_id TEXT NOT NULL UNIQUE, city TEXT NOT NULL,
 state TEXT NOT NULL, region TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1))
);
CREATE INDEX IF NOT EXISTS institution_search ON institutions(is_demo,name);
CREATE TABLE IF NOT EXISTS tags (code TEXT PRIMARY KEY, label TEXT NOT NULL, group_name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cases (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, institution_id TEXT NOT NULL REFERENCES institutions(id),
 bureau TEXT NOT NULL, assigned_to TEXT NOT NULL REFERENCES officials(id), created_by TEXT NOT NULL REFERENCES officials(id),
 status TEXT NOT NULL CHECK(status IN ('Pending','Under process','Awaiting information','Disposed')),
 intake TEXT NOT NULL CHECK(intake IN ('Submitted','Approved','Returned','Rejected')),
 escalated INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Routine', tags TEXT NOT NULL DEFAULT '[]',
 description TEXT NOT NULL, next_action TEXT NOT NULL, received_at TEXT NOT NULL, due_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)), approval_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cases_assigned ON cases(is_demo,assigned_to,intake,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS cases_institution ON cases(is_demo,institution_id,intake,status);
CREATE INDEX IF NOT EXISTS cases_created ON cases(is_demo,created_by,intake);
CREATE INDEX IF NOT EXISTS cases_bureau ON cases(is_demo,bureau,intake,updated_at DESC);
CREATE TABLE IF NOT EXISTS case_events (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), kind TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES officials(id), body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_case ON case_events(case_id,created_at,id);
CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON case_events BEGIN SELECT RAISE(ABORT,'Case history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON case_events BEGIN SELECT RAISE(ABORT,'Case history is append-only'); END;
CREATE TABLE IF NOT EXISTS case_grants (
 case_id TEXT NOT NULL REFERENCES cases(id), official_id TEXT NOT NULL REFERENCES officials(id),
 granted_at TEXT NOT NULL, revoked_at TEXT, PRIMARY KEY(case_id,official_id)
);
CREATE INDEX IF NOT EXISTS grants_official ON case_grants(official_id,revoked_at,case_id);
CREATE TABLE IF NOT EXISTS coordination_requests (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), requester_id TEXT NOT NULL REFERENCES officials(id),
 target_official_id TEXT NOT NULL REFERENCES officials(id), target_bureau TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Awaiting manager','Awaiting Bureau','Approved','Rejected','Revoked')),
 reason TEXT NOT NULL, manager_approved_at TEXT, bureau_approved_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coordination_case ON coordination_requests(case_id,created_at);
CREATE INDEX IF NOT EXISTS coordination_target ON coordination_requests(target_official_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS coordination_open ON coordination_requests(case_id,target_official_id) WHERE status IN ('Awaiting manager','Awaiting Bureau','Approved');
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES officials(id), recipient_id TEXT NOT NULL REFERENCES officials(id),
 case_id TEXT REFERENCES cases(id), body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
 is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1))
);
CREATE INDEX IF NOT EXISTS messages_recipient ON messages(is_demo,recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender ON messages(is_demo,sender_id,created_at DESC);
