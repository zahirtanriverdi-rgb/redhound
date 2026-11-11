create table public.trucks (id uuid primary key);

-- The loop covers other tables, not trucks.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['vans'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
