create table if not exists "orders" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  total numeric
);
alter table orders enable row level security;
create policy "Read orders" on orders for select to anon, authenticated using (true);

create table public.contact_requests (id bigint primary key, email text, body text);
alter table public.contact_requests enable row level security;
create policy "Anyone can send a request" on public.contact_requests
  for insert to anon with check (true);

-- Turned on, then turned off again later.
create table public.invoices (id bigint primary key, owner uuid);
alter table public.invoices enable row level security;
alter table public.invoices disable row level security;
