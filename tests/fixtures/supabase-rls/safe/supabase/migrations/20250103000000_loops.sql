create table public.fleet_inspections (id uuid primary key);
create table public.fleet_results (id uuid primary key);
create table public.vehicles (id uuid primary key);
create table public.drivers (id uuid primary key);

-- RLS turned on in a loop over a fixed list of tables.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_inspections','fleet_results'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- A static statement run from a DO block.
do $body$ begin
  execute 'alter table public.vehicles enable row level security';
end $body$;

-- A loop over every table in the schema.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
