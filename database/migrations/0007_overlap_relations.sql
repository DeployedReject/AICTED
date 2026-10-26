CREATE TABLE case_relations (
 case_id TEXT NOT NULL REFERENCES cases(id),related_case_id TEXT NOT NULL REFERENCES cases(id),
 kind TEXT NOT NULL CHECK(kind IN('Related','Duplicate','Unrelated')),reason TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES officials(id),created_at TEXT NOT NULL,
 PRIMARY KEY(case_id,related_case_id),CHECK(case_id<related_case_id)
);
CREATE INDEX relations_other ON case_relations(related_case_id,case_id);
CREATE INDEX events_kind_case ON case_events(case_id,kind,created_at DESC);
CREATE INDEX cases_deadline ON cases(is_demo,intake,status,due_at);
