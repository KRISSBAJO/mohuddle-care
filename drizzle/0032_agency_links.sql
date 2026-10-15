-- Every agency table gets its row rule and index, and every link between two agency tables also
-- checks that both rows belong to the same agency. Safe to run again: later migrations that add a
-- table end with "SELECT mohuddle_tenant_guards();".
CREATE OR REPLACE FUNCTION mohuddle_tenant_guards() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t text;
  r record;
  name text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'agency_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'agency_isolation') THEN
      EXECUTE format('CREATE POLICY agency_isolation ON %I TO mohuddle_app USING (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid) WITH CHECK (agency_id = nullif(current_setting(''app.agency_id'', true), '''')::uuid)', t);
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (agency_id)', t || '_agency', t);
  END LOOP;

  -- A link (home_id, say) is checked together with agency_id against the same pair on the other
  -- table. A null link is still allowed, and the original link keeps its own delete rule.
  FOR r IN
    SELECT con.conname, src.relname AS src, dst.relname AS dst, sa.attname AS src_col, da.attname AS dst_col
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class dst ON dst.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = con.conkey[1]
    JOIN pg_attribute da ON da.attrelid = con.confrelid AND da.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND sa.attname <> 'agency_id'
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = con.conrelid AND x.attname = 'agency_id' AND NOT x.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = con.confrelid AND x.attname = 'agency_id' AND NOT x.attisdropped)
  LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (agency_id, %I)', r.dst || '_agency_key', r.dst, r.dst_col);
    name := left(r.conname, 55) || '_agency';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = name AND conrelid = format('public.%I', r.src)::regclass) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (agency_id, %I) REFERENCES %I (agency_id, %I)', r.src, name, r.src_col, r.dst, r.dst_col);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
SELECT mohuddle_tenant_guards();
