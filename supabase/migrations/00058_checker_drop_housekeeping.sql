-- 00058: drop "ניסיון במשק בית יתרון" from the צ'קר/ית template.
--
-- 00056 seeded it as a default requirement, so every generated ad for that role
-- framed the job as housekeeping-adjacent. That is the wrong pitch for the
-- candidates this reaches, and Saar asked for it out. Dropping the element
-- rather than rewriting the whole array keeps any edits made in the UI since.

UPDATE public.fb_role_templates
   SET requirements = array_remove(requirements, 'ניסיון במשק בית יתרון')
 WHERE role_key = 'checker';
