-- =============================================================================
-- DELETE do seed RUN_SEED_150_LOJAS_TESTE.sql
-- Remove todas as lojas com prefixo: SEED_BULK_20260417
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _seed_target AS
SELECT id
FROM public.shops
WHERE name LIKE 'SEED_BULK_20260417 %';

-- Opcional: remove objetos de storage vinculados às lojas seed
DELETE FROM storage.objects
WHERE bucket_id = 'shop-media'
  AND split_part(name, '/', 1) IN (
    SELECT id::text FROM _seed_target
  );

-- DELETE principal (demais tabelas com FK ON DELETE CASCADE serão limpas)
DELETE FROM public.shops
WHERE id IN (SELECT id FROM _seed_target);

SELECT
  (SELECT count(*) FROM _seed_target) AS shops_removed;

COMMIT;
