-- ============================================================
-- Migration: Campaign Assignments & Status Transitions
-- Description: Links workers to demand units for campaign
--   staffing, with status lifecycle tracking and
--   auto-update of filled_count on demand_units.
-- ============================================================

-- ── 0. Rename workers.name → full_name ────────────────────
--    (UI references full_name; migration 00007 created "name")

ALTER TABLE workers RENAME COLUMN name TO full_name;

-- ── 1. Campaign Assignments Table ─────────────────────────

CREATE TABLE campaign_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_unit_id  UUID        NOT NULL REFERENCES demand_units(id) ON DELETE CASCADE,
  worker_id       UUID        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'Matched'
                              CHECK (status IN (
                                'Matched',    -- נמצא התאמה
                                'Assigned',   -- שובץ
                                'Confirmed',  -- אישר הגעה
                                'Arrived',    -- הגיע בפועל
                                'No Show'     -- לא הגיע
                              )),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate worker per demand unit
CREATE UNIQUE INDEX idx_campaign_assignments_unique
  ON campaign_assignments (demand_unit_id, worker_id);

CREATE INDEX idx_campaign_assignments_demand_unit ON campaign_assignments (demand_unit_id);
CREATE INDEX idx_campaign_assignments_worker      ON campaign_assignments (worker_id);
CREATE INDEX idx_campaign_assignments_status      ON campaign_assignments (status);

ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_campaign_assignments"
  ON campaign_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_campaign_assignments"
  ON campaign_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_campaign_assignments"
  ON campaign_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_campaign_assignments"
  ON campaign_assignments FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_select_campaign_assignments"
  ON campaign_assignments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_campaign_assignments"
  ON campaign_assignments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_campaign_assignments"
  ON campaign_assignments FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 2. Auto-update demand_units.filled_count ──────────────

CREATE OR REPLACE FUNCTION update_demand_unit_filled_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_id UUID;
BEGIN
  -- Determine which demand_unit to update
  IF TG_OP = 'DELETE' THEN
    v_unit_id := OLD.demand_unit_id;
  ELSE
    v_unit_id := NEW.demand_unit_id;
  END IF;

  -- Recount active assignments (everything except 'No Show')
  UPDATE demand_units
  SET filled_count = (
    SELECT COUNT(*)
    FROM campaign_assignments
    WHERE demand_unit_id = v_unit_id
      AND status != 'No Show'
  )
  WHERE id = v_unit_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_campaign_assignment_count
  AFTER INSERT OR UPDATE OR DELETE ON campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION update_demand_unit_filled_count();

-- ── 3. transition_assignment_status RPC ───────────────────

CREATE OR REPLACE FUNCTION transition_assignment_status(
  p_assignment_id UUID,
  p_new_status    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment RECORD;
  v_valid      BOOLEAN := false;
BEGIN
  -- ① Fetch assignment
  SELECT * INTO v_assignment
  FROM campaign_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',  'ERROR',
      'message', 'השיבוץ לא נמצא'
    );
  END IF;

  -- ② Validate transition
  --    Matched  → Assigned
  --    Assigned → Confirmed | No Show
  --    Confirmed → Arrived | No Show
  --    Arrived  → (terminal)
  --    No Show  → Matched (allow retry)

  IF v_assignment.status = 'Matched'   AND p_new_status = 'Assigned'  THEN v_valid := true; END IF;
  IF v_assignment.status = 'Assigned'  AND p_new_status = 'Confirmed' THEN v_valid := true; END IF;
  IF v_assignment.status = 'Assigned'  AND p_new_status = 'No Show'   THEN v_valid := true; END IF;
  IF v_assignment.status = 'Confirmed' AND p_new_status = 'Arrived'   THEN v_valid := true; END IF;
  IF v_assignment.status = 'Confirmed' AND p_new_status = 'No Show'   THEN v_valid := true; END IF;
  IF v_assignment.status = 'No Show'   AND p_new_status = 'Matched'   THEN v_valid := true; END IF;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'status',  'ERROR',
      'message', format('לא ניתן לעבור מ"%s" ל"%s"', v_assignment.status, p_new_status)
    );
  END IF;

  -- ③ Apply transition
  UPDATE campaign_assignments
  SET status = p_new_status
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'status',  'OK',
    'message', 'הסטטוס עודכן בהצלחה'
  );
END;
$$;
