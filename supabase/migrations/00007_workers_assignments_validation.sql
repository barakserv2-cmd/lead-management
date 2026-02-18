-- ============================================================
-- Migration: Workers, Assignments & Assignment Validation
-- Description: Workers table, assignments join table,
--   auto-update trigger for assigned_count, and
--   validate_assignment RPC for safety guard checks.
-- ============================================================

-- ── 1. Workers Table ────────────────────────────────────────

CREATE TABLE workers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  phone       TEXT,
  skills      TEXT[]      DEFAULT '{}',
  location    TEXT,
  status      TEXT        NOT NULL DEFAULT 'Available'
                          CHECK (status IN ('Available', 'Assigned', 'Inactive')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workers_status ON workers (status);
CREATE INDEX idx_workers_phone  ON workers (phone);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_workers"
  ON workers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_workers"
  ON workers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_workers"
  ON workers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_workers"
  ON workers FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_select_workers"
  ON workers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_workers"
  ON workers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_workers"
  ON workers FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 2. Assignments Table ────────────────────────────────────

CREATE TABLE assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active', 'Completed', 'Cancelled')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT
);

-- Prevent exact duplicate active assignments
CREATE UNIQUE INDEX idx_assignments_unique_active
  ON assignments (worker_id, job_id) WHERE status = 'Active';

CREATE INDEX idx_assignments_worker ON assignments (worker_id);
CREATE INDEX idx_assignments_job    ON assignments (job_id);
CREATE INDEX idx_assignments_status ON assignments (status);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_assignments"
  ON assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_assignments"
  ON assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_assignments"
  ON assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_assignments"
  ON assignments FOR DELETE TO authenticated USING (true);
CREATE POLICY "anon_select_assignments"
  ON assignments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_assignments"
  ON assignments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_assignments"
  ON assignments FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 3. Auto-update jobs.assigned_count ──────────────────────

CREATE OR REPLACE FUNCTION update_job_assigned_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'Active' THEN
    UPDATE jobs SET assigned_count = assigned_count + 1 WHERE id = NEW.job_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Active → not Active: decrement
    IF OLD.status = 'Active' AND NEW.status != 'Active' THEN
      UPDATE jobs SET assigned_count = assigned_count - 1 WHERE id = NEW.job_id;
    -- Not Active → Active: increment
    ELSIF OLD.status != 'Active' AND NEW.status = 'Active' THEN
      UPDATE jobs SET assigned_count = assigned_count + 1 WHERE id = NEW.job_id;
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD.status = 'Active' THEN
    UPDATE jobs SET assigned_count = assigned_count - 1 WHERE id = OLD.job_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_assignment_count
  AFTER INSERT OR UPDATE OR DELETE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_job_assigned_count();

-- ── 4. validate_assignment RPC ──────────────────────────────

CREATE OR REPLACE FUNCTION validate_assignment(p_worker_id UUID, p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_job    RECORD;
  v_worker RECORD;
  v_other  RECORD;
BEGIN

  -- ① Job must exist and be Open
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'JOB_NOT_FOUND',
      'message',        'המשרה לא נמצאה',
      'details',        'המשרה המבוקשת לא קיימת במערכת.',
      'allow_override', false
    );
  END IF;

  IF v_job.status != 'Open' THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'JOB_NOT_OPEN',
      'message',        'המשרה אינה פתוחה',
      'details',        format('המשרה "%s" במצב %s — לא ניתן לשבץ אליה.', v_job.title, v_job.status),
      'allow_override', false
    );
  END IF;

  -- ② Worker must exist and be active
  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'WORKER_NOT_FOUND',
      'message',        'העובד לא נמצא',
      'details',        'העובד המבוקש לא קיים במערכת.',
      'allow_override', false
    );
  END IF;

  IF v_worker.status = 'Inactive' THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'WORKER_INACTIVE',
      'message',        'העובד אינו פעיל',
      'details',        format('העובד "%s" מסומן כלא פעיל במערכת.', v_worker.name),
      'allow_override', false
    );
  END IF;

  -- ③ No duplicate active assignment
  IF EXISTS (
    SELECT 1 FROM assignments
    WHERE worker_id = p_worker_id AND job_id = p_job_id AND status = 'Active'
  ) THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'ALREADY_ASSIGNED',
      'message',        'שיבוץ כפול',
      'details',        format('העובד "%s" כבר משובץ למשרה "%s".', v_worker.name, v_job.title),
      'allow_override', false
    );
  END IF;

  -- ④ Job not fully staffed
  IF v_job.assigned_count >= v_job.needed_count THEN
    RETURN jsonb_build_object(
      'status',         'BLOCK',
      'code',           'JOB_FULL',
      'message',        'המשרה מאוישת במלואה',
      'details',        format('"%s" דורשת %s עובדים ו-%s כבר משובצים.', v_job.title, v_job.needed_count, v_job.assigned_count),
      'allow_override', false
    );
  END IF;

  -- ⑤ Warning: worker already assigned elsewhere
  SELECT a.id, j.title AS job_title, c.name AS client_name
  INTO v_other
  FROM assignments a
  JOIN jobs j    ON j.id = a.job_id
  JOIN clients c ON c.id = j.client_id
  WHERE a.worker_id = p_worker_id
    AND a.status = 'Active'
    AND a.job_id != p_job_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',         'WARNING',
      'code',           'WORKER_HAS_ASSIGNMENT',
      'message',        'העובד משובץ למשרה אחרת',
      'details',        format('"%s" משובץ כרגע ל"%s" אצל %s. שיבוץ נוסף עלול ליצור קונפליקט.', v_worker.name, v_other.job_title, v_other.client_name),
      'allow_override', true
    );
  END IF;

  -- ✓ All checks passed
  RETURN jsonb_build_object(
    'status',         'OK',
    'code',           'VALID',
    'message',        'השיבוץ תקין',
    'details',        NULL,
    'allow_override', true
  );

END;
$$;
