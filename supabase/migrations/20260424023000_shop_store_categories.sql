ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS store_categories jsonb;

COMMENT ON COLUMN public.shops.store_categories IS
'Configuração da vitrine da loja (4 categorias com nome e ícone): [{ key, name, icon }].';

UPDATE public.shops
SET store_categories = jsonb_build_array(
  jsonb_build_object('key', 'products', 'name', 'Produtos', 'icon', 'fas fa-tags'),
  jsonb_build_object('key', 'fashion', 'name', 'Moda', 'icon', 'fas fa-shirt'),
  jsonb_build_object('key', 'food', 'name', 'Food', 'icon', 'fas fa-utensils'),
  jsonb_build_object('key', 'electronics', 'name', 'Eletrônicos', 'icon', 'fas fa-mobile-screen-button')
)
WHERE store_categories IS NULL;

ALTER TABLE public.shops
ALTER COLUMN store_categories SET DEFAULT jsonb_build_array(
  jsonb_build_object('key', 'products', 'name', 'Produtos', 'icon', 'fas fa-tags'),
  jsonb_build_object('key', 'fashion', 'name', 'Moda', 'icon', 'fas fa-shirt'),
  jsonb_build_object('key', 'food', 'name', 'Food', 'icon', 'fas fa-utensils'),
  jsonb_build_object('key', 'electronics', 'name', 'Eletrônicos', 'icon', 'fas fa-mobile-screen-button')
);
