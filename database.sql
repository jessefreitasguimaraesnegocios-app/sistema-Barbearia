-- =============================================================================
-- LEGADO / referência — NÃO é a fonte do schema do Beauty Hub.
-- =============================================================================
--
-- O schema versionado do projeto está em:  supabase/migrations/*.sql
--
-- Para criar ou atualizar o banco no Supabase remoto:
--   npx supabase link --project-ref <seu_ref>
--   npm run db:push
--
-- Scripts manuais opcionais (SQL Editor):  supabase/RUN_*.sql
-- Leia:  supabase/README.md  e  docs/SUPABASE_PROJETO_ATUAL.md
--
-- O conteúdo antigo de CREATE TABLE deste arquivo foi substituído para evitar
-- duplicidade e divergência com as migrations.
-- =============================================================================

SELECT
  'Use supabase/migrations + db push'::text AS aplicar_schema,
  now() AS checado_em;
