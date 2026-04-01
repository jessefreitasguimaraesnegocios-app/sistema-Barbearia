-- Perfis que ficaram como 'cliente' por causa do trigger handle_new_user, mas são donos em shops.owner_id.
UPDATE public.profiles p
SET role = 'barbearia', shop_id = s.id
FROM public.shops s
WHERE s.owner_id = p.id
  AND (
    p.role IS DISTINCT FROM 'barbearia'
    OR p.shop_id IS DISTINCT FROM s.id
  );
