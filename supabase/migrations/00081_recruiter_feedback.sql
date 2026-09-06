-- Recruiter feedback channel: recruiters report problems with the machine
-- (גובגט) and the system (CRM); the admin gets a daily WhatsApp summary and
-- marks items handled.
create table if not exists recruiter_feedback (
  id          uuid primary key default gen_random_uuid(),
  author      text not null,                                   -- recruiter email
  category    text not null default 'other'
                check (category in ('machine', 'system', 'other')),
  body        text not null,
  status      text not null default 'open'
                check (status in ('open', 'handled')),
  handled_by  text,
  handled_at  timestamptz,
  digested_at timestamptz,                                     -- included in a daily summary
  created_at  timestamptz not null default now()
);

create index if not exists idx_recruiter_feedback_open
  on recruiter_feedback (created_at desc) where status = 'open';

alter table recruiter_feedback enable row level security;
-- No policies: only the service-role API routes read/write this table.
