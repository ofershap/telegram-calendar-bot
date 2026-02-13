create table if not exists family_announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  color int default 0,
  created_at timestamptz default now()
);
