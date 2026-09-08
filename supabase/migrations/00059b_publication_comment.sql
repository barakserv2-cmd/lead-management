-- 00059: split the wa.me link out of the post body into a first comment.
--
-- A URL inside a Facebook group post makes Facebook render an empty "WA.ME"
-- link-preview card (ugly, low trust) AND quietly downranks the post's reach
-- because it points off-platform. The method recruiters actually use is to keep
-- the post clean and paste the link as the FIRST COMMENT. So a publication now
-- carries two texts: body_snapshot (the post, no link) and comment_snapshot
-- (the link, pasted as the first comment).

ALTER TABLE public.fb_publications
  ADD COLUMN IF NOT EXISTS comment_snapshot text;
