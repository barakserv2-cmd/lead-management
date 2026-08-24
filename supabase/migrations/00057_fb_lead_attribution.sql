-- 00057: close the loop between a Facebook group post and a lead in the CRM.
--
-- Until now the WhatsApp webhook dropped every message from a number it did not
-- already know (`if (!lead) return`), so a candidate who answered a group post
-- vanished. Each publication's wa.me link carries a unique BK-XXXX code in its
-- prefilled text, which means an inbound message can prove which post — and
-- therefore which group — it came from. That is enough to open a lead safely:
-- only messages carrying a real code create one, so a friend texting the
-- recruiter's personal number never turns into a candidate.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fb_publication_id uuid
  REFERENCES public.fb_publications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_fb_publication
  ON public.leads (fb_publication_id)
  WHERE fb_publication_id IS NOT NULL;

-- Counting responses from the webhook must not lose concurrent writes.
CREATE OR REPLACE FUNCTION public.increment_publication_responses(p_id uuid)
RETURNS void LANGUAGE sql AS $fn$
  UPDATE public.fb_publications
     SET responses = responses + 1
   WHERE id = p_id;
$fn$;
