-- Profiles: created, but Row Level Security is never turned on.
create table public.profiles (
  id uuid primary key references auth.users,
  full_name text
);

create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid references auth.users,
  body text
);
alter table public.posts enable row level security;

create policy "Anyone can edit posts" on public.posts
  for update using (true);

create policy "Anyone can read posts" on public.posts
  for select using (true);
