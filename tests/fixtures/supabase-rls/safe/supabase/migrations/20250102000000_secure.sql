alter table public.todos enable row level security;
drop policy "temp open" on public.todos;

create policy "Owners manage their todos" on public.todos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Service role does everything" on public.todos
  for all to service_role using (true) with check (true);

create table public.site_settings (key text primary key, value text);
alter table public.site_settings enable row level security;

-- Restrictive policies only narrow access, so "true" adds nothing.
create policy "no-op" on public.site_settings as restrictive for select using (true);
