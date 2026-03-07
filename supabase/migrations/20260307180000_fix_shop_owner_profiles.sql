-- Corrige perfis de donos de loja que foram criados como 'cliente' pelo trigger (antes do upsert na create-shop)
UPDATE public.profiles p
SET role = 'barbearia', shop_id = s.id
FROM public.shops s
WHERE s.owner_id = p.id
  AND (p.role != 'barbearia' OR p.shop_id IS DISTINCT FROM s.id);
