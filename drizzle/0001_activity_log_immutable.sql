-- The activity log is the accountability record for an otherwise open, collaborative system.
-- Rows can be inserted, never changed or removed.
CREATE OR REPLACE FUNCTION activity_log_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (% is not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER activity_log_no_update_delete
  BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION activity_log_is_immutable();
--> statement-breakpoint
CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION activity_log_is_immutable();
