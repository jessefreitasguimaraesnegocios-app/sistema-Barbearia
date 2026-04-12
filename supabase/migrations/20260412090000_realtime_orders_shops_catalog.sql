-- Realtime para pedidos (lojinha), loja e catálogo — postgres_changes no front parceiro.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'shops', 'services', 'professionals', 'products']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
