-- 00042: backfill handled_by for leads handled before attribution existed.
-- Leads whose status was changed by a real recruiter (email in
-- lead_status_history.changed_by) but before changeLeadStatus started stamping
-- handled_by showed up on the daily board as "טרם טופלו". Attribute them to the
-- most recent recruiter who changed their status. Idempotent (fills NULLs only).

UPDATE public.leads l
SET handled_by = h.changed_by,
    handled_at = h.changed_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, changed_by, changed_at
  FROM public.lead_status_history
  WHERE changed_by LIKE '%@%'
  ORDER BY lead_id, changed_at DESC
) h
WHERE l.id = h.lead_id
  AND l.handled_by IS NULL;
