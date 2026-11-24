-- Observe the replacement INSERT as well as the original booking's release.
-- Immediate row triggers run too early for moves within the same live session.
DROP TRIGGER refresh_resolved_schedule_change ON clinzo.appointment;
CREATE CONSTRAINT TRIGGER refresh_resolved_schedule_change
  AFTER UPDATE ON clinzo.appointment
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.schedule_change_requested_at IS NOT NULL
    AND (NEW.status IN ('cancelled','rejected','no_show') OR NEW.capacity_released_at IS NOT NULL))
  EXECUTE FUNCTION clinzo.refresh_resolved_schedule_change();
