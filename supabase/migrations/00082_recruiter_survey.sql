-- Structured recruiter survey — focused on how well גובגט presents/matches
-- jobs and its conversation quality, so we can improve it with real signal.
create table if not exists recruiter_survey (
  id             uuid primary key default gen_random_uuid(),
  author         text not null,
  job_relevance  int  check (job_relevance between 1 and 5),   -- מציגה משרות רלוונטיות
  job_accuracy   int  check (job_accuracy  between 1 and 5),   -- פרטי המשרות מדויקים
  conversation   int  check (conversation  between 1 and 5),   -- שיחות טבעיות ומקצועיות
  missing        text[] not null default '{}',                 -- מה חסר (רב-בחירה)
  comment        text,                                         -- מה הכי ישפר / מקרה ספציפי
  created_at     timestamptz not null default now()
);

create index if not exists idx_recruiter_survey_created on recruiter_survey (created_at desc);
alter table recruiter_survey enable row level security;
-- service-role API only
