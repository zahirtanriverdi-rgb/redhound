create table public.todos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users,
  title text
);

-- An open policy that a later migration replaces.
create policy "temp open" on public.todos for all using (true);

-- Tables outside the public schema are not exposed by the Supabase API.
create table private.audit_log (id bigint primary key, event text);

-- A CREATE TABLE inside a function body is not a table of this schema.
create or replace function public.make_scratch() returns void language plpgsql as $$
begin
  create table public.scratch (id int);
end;
$$;
