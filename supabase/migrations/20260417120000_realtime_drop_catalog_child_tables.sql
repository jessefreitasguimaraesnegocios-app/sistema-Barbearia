-- Realtime: remove services/professionals/products da publicação supabase_realtime.
-- O front passa a depender só de postgres_changes em `shops` para catálogo (triggers
-- bump_shop_catalog_updated_at_from_child já atualizam shops.updated_at).
-- Mantêm-se na publicação: shops, orders, appointments (conforme migrations anteriores).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['services', 'professionals', 'products']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
