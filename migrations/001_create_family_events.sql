create table if not exists family_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  person text not null,
  category text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  recurring boolean default false,
  reminder_minutes int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_family_events_start_time on family_events (start_time);
create index if not exists idx_family_events_person on family_events (person);
