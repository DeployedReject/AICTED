ALTER TABLE case_events ADD COLUMN case_assigned_snapshot TEXT NOT NULL DEFAULT '';
DROP TRIGGER immutable_events_update;
DROP TRIGGER event_actor_snapshot;
CREATE TRIGGER immutable_events_update BEFORE UPDATE ON case_events WHEN NOT(
 OLD.actor_name_snapshot='' AND OLD.actor_bureau_snapshot='' AND OLD.actor_designation_snapshot='' AND
 NEW.id=OLD.id AND NEW.case_id=OLD.case_id AND NEW.kind=OLD.kind AND NEW.actor_id=OLD.actor_id AND NEW.body=OLD.body AND NEW.created_at=OLD.created_at AND NEW.is_public=OLD.is_public AND
 NEW.actor_name_snapshot=(SELECT name FROM officials WHERE id=OLD.actor_id) AND NEW.actor_bureau_snapshot=(SELECT bureau FROM officials WHERE id=OLD.actor_id) AND NEW.actor_designation_snapshot=(SELECT designation FROM officials WHERE id=OLD.actor_id) AND
 NEW.case_assigned_snapshot=(SELECT assigned_to FROM cases WHERE id=OLD.case_id) AND NEW.case_status_snapshot=(SELECT status FROM cases WHERE id=OLD.case_id) AND NEW.case_bureau_snapshot=(SELECT bureau FROM cases WHERE id=OLD.case_id)
) BEGIN SELECT RAISE(ABORT,'Case history is append-only');END;
CREATE TRIGGER event_actor_snapshot AFTER INSERT ON case_events WHEN NEW.actor_name_snapshot='' BEGIN
 UPDATE case_events SET case_assigned_snapshot=(SELECT assigned_to FROM cases WHERE id=NEW.case_id),actor_name_snapshot=(SELECT name FROM officials WHERE id=NEW.actor_id),actor_bureau_snapshot=(SELECT bureau FROM officials WHERE id=NEW.actor_id),actor_designation_snapshot=(SELECT designation FROM officials WHERE id=NEW.actor_id),case_status_snapshot=(SELECT status FROM cases WHERE id=NEW.case_id),case_bureau_snapshot=(SELECT bureau FROM cases WHERE id=NEW.case_id) WHERE id=NEW.id;
END;
DELETE FROM app_schema;
INSERT INTO app_schema VALUES(14,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
