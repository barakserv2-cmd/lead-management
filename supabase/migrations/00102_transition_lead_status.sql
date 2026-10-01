-- 00102: one atomic step for a status change — guarded update + history row.
--
-- Review committee 29/09, B4. changeLeadStatus read the lead, validated the
-- move, then wrote it with a plain UPDATE and inserted the history row in a
-- second request whose error was never checked:
--   * two people (or a recruiter and גובגט) moving the same lead at once could
--     both pass validation against the same old status, and the later write
--     won silently;
--   * a failed history insert left a status change with no record of who
--     made it.
--
-- transition_lead_status() applies the change only if the lead is still in
-- the status the caller validated against (p_from), and writes the history
-- row in the same transaction. It returns false when the status moved in the
-- meantime, so the caller can tell the user instead of overwriting.
--
-- p_patch is the set of columns to write (it must include "status"); each key
-- is quoted with %I and must be a real column of leads, so an unknown key
-- fails the whole call instead of being ignored. Service role only.

CREATE OR REPLACE FUNCTION public.transition_lead_status(
  p_lead_id    uuid,
  p_from       text,
  p_patch      jsonb,
  p_changed_by text,
  p_notes      text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_to   text := p_patch->>'status';
  v_set  text;
  v_rows integer;
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'transition_lead_status: patch must set status';
  END IF;

  SELECT string_agg(format('%I = r.%I', k, k), ', ')
    INTO v_set
    FROM jsonb_object_keys(p_patch) AS k;

  EXECUTE format(
    'UPDATE public.leads AS l SET %s
       FROM jsonb_populate_record(NULL::public.leads, $1) AS r
      WHERE l.id = $2 AND l.status IS NOT DISTINCT FROM $3',
    v_set
  ) USING p_patch, p_lead_id, p_from;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false; -- the lead is gone, or its status changed since it was read
  END IF;

  INSERT INTO public.lead_status_history (lead_id, from_status, to_status, changed_by, notes)
  VALUES (p_lead_id, p_from, v_to, p_changed_by, p_notes);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_lead_status(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_lead_status(uuid, text, jsonb, text, text) TO service_role;
