-- Catálogo global de produtos (BH / referência nacional) por tipo de loja + categorias fixas.
-- Cada estabelecimento continua em `products` com preço, estoque e foto próprios; `catalog_item_id` aponta para o item mestre (um "Aqua" no catálogo, N linhas em products com preços diferentes).

CREATE TABLE IF NOT EXISTS public.product_catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_type TEXT NOT NULL CHECK (shop_type IN ('BARBER', 'SALON', 'MANICURE')),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_type, name)
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_categories_shop_type
  ON public.product_catalog_categories (shop_type, sort_order);

CREATE TABLE IF NOT EXISTS public.product_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.product_catalog_categories (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_image TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_items_category
  ON public.product_catalog_items (category_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_catalog_items_category_name
  ON public.product_catalog_items (category_id, name);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES public.product_catalog_items (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.catalog_item_id IS
  'Opcional: vínculo ao item do catálogo global. UNIQUE(shop_id, catalog_item_id) evita duplicar o mesmo item na mesma loja.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_catalog_item_unique
  ON public.products (shop_id, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

-- Leitura pública (cliente vê produtos da loja; catálogo é só referência para o parceiro montar a loja)
ALTER TABLE public.product_catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product catalog categories are viewable by everyone" ON public.product_catalog_categories;
CREATE POLICY "Product catalog categories are viewable by everyone"
  ON public.product_catalog_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Product catalog items are viewable by everyone" ON public.product_catalog_items;
CREATE POLICY "Product catalog items are viewable by everyone"
  ON public.product_catalog_items FOR SELECT USING (true);

-- Seed: categorias (4 por tipo) + ~30 itens por tipo (referência mercado BH / marcas comuns no Brasil)
WITH ins_cat AS (
  INSERT INTO public.product_catalog_categories (shop_type, name, sort_order)
  VALUES
    ('BARBER', 'Produtos para cabelo', 1),
    ('BARBER', 'Produtos para barba', 2),
    ('BARBER', 'Máquinas & ferramentas', 3),
    ('BARBER', 'Acessórios', 4),
    ('SALON', 'Produtos capilares', 1),
    ('SALON', 'Química & coloração', 2),
    ('SALON', 'Tratamentos', 3),
    ('SALON', 'Equipamentos profissionais', 4),
    ('MANICURE', 'Esmaltes & finalização', 1),
    ('MANICURE', 'Alongamento de unhas', 2),
    ('MANICURE', 'Cuidados & preparação', 3),
    ('MANICURE', 'Equipamentos & acessórios', 4)
  ON CONFLICT (shop_type, name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id, shop_type, name
),
catalog_seed_rows (shop_type, cat_name, name, description, sort_order) AS (
  VALUES
    ('BARBER'::text, 'Produtos para cabelo', 'Shampoo Clear Men 250ml', 'Limpeza profunda — linha masculina muito vendida em BH.', 1),
    ('BARBER', 'Produtos para cabelo', 'Shampoo Elseve Men', 'Hidratação e força para fios curtos.', 2),
    ('BARBER', 'Produtos para cabelo', 'Condicionador anticaspa', 'Uso frequente pós-corte.', 3),
    ('BARBER', 'Produtos para cabelo', 'Máscara capilar Salon Line', 'Nutrição rápida — referência em perfumarias da região.', 4),
    ('BARBER', 'Produtos para cabelo', 'Pomada modeladora efeito matte', 'Textura seca, acabamento natural.', 5),
    ('BARBER', 'Produtos para cabelo', 'Cera modeladora brilho', 'Finalização clássica.', 6),
    ('BARBER', 'Produtos para cabelo', 'Spray fixador extra forte', 'Fixação para eventos e calor.', 7),
    ('BARBER', 'Produtos para cabelo', 'Óleo capilar / barba multiuso', 'Brilho e perfume suave.', 8),
    ('BARBER', 'Produtos para barba', 'Balm pós-barba', 'Hidratação após navalha.', 1),
    ('BARBER', 'Produtos para barba', 'Loção após-barba refrescante', 'Sensação de frescor.', 2),
    ('BARBER', 'Produtos para barba', 'Sabonete líquido para barba', 'Limpeza diária da barba.', 3),
    ('BARBER', 'Produtos para barba', 'Óleo para barba', 'Amaciamento e perfume.', 4),
    ('BARBER', 'Produtos para barba', 'Kit barba (óleo + balm)', 'Combo mais pedido em barbearias.', 5),
    ('BARBER', 'Produtos para barba', 'Cera para bigode', 'Modelagem fina.', 6),
    ('BARBER', 'Produtos para barba', 'Shampoo para barba', 'Limpeza sem ressecar.', 7),
    ('BARBER', 'Máquinas & ferramentas', 'Máquina de corte sem fio', 'Referência Wahl/Philco — alta rotação em BH.', 1),
    ('BARBER', 'Máquinas & ferramentas', 'Aparador de acabamento (trimmer)', 'Contorno e degradê.', 2),
    ('BARBER', 'Máquinas & ferramentas', 'Navalha barbear tradicional', 'Barba clássica com gilete.', 3),
    ('BARBER', 'Máquinas & ferramentas', 'Tesoura fio laser 6"', 'Corte tesoura e textura.', 4),
    ('BARBER', 'Máquinas & ferramentas', 'Kit pentes profissionais', 'Gradiente e alinhamento.', 5),
    ('BARBER', 'Máquinas & ferramentas', 'Aparador nariz/orelha', 'Acabamento higiênico.', 6),
    ('BARBER', 'Máquinas & ferramentas', 'Lâmina descartável premium', 'Reposição navalha shavette.', 7),
    ('BARBER', 'Acessórios', 'Capa de corte impermeável', 'Proteção de roupa — padrão em salão.', 1),
    ('BARBER', 'Acessórios', 'Toalha de rosto branca', 'Reposição semanal.', 2),
    ('BARBER', 'Acessórios', 'Spray higienizante para máquinas', 'Manutenção entre clientes.', 3),
    ('BARBER', 'Acessórios', 'Pente de madeira largo', 'Desembaraço e acabamento.', 4),
    ('BARBER', 'Acessórios', 'Espelho de mão com aumento', 'Detalhe de barba.', 5),
    ('BARBER', 'Acessórios', 'Papel gola descartável', 'Consumo alto em barbearia.', 6),
    ('BARBER', 'Acessórios', 'Talco pós-barba', 'Acabamento clássico.', 7),
    ('BARBER', 'Acessórios', 'Escova cerdas macias', 'Distribuição de produto.', 8),
    ('SALON', 'Produtos capilares', 'Shampoo profissional 1L', 'Salão — limpeza suave diária.', 1),
    ('SALON', 'Produtos capilares', 'Condicionador hidratação 1L', 'Reposição pós-química.', 2),
    ('SALON', 'Produtos capilares', 'Leave-in anti-frizz', 'Calor úmido de BH.', 3),
    ('SALON', 'Produtos capilares', 'Sérum para pontas', 'Brilho imediato.', 4),
    ('SALON', 'Produtos capilares', 'Máscara ultra-hidratação', 'Tratamento semanal.', 5),
    ('SALON', 'Produtos capilares', 'Creme pentear cacheados', 'Definição sem peso.', 6),
    ('SALON', 'Produtos capilares', 'Protetor térmico spray', 'Antes de secador/chapinha.', 7),
    ('SALON', 'Produtos capilares', 'Shampoo silver matizador', 'Loiros e platinados.', 8),
    ('SALON', 'Química & coloração', 'Tintura oxidante 20 vol', 'Base de coloração.', 1),
    ('SALON', 'Química & coloração', 'Tonalizante fashion', 'Refresco de cor entre visitas.', 2),
    ('SALON', 'Química & coloração', 'Descolorante em pó', 'Mechas e loiros.', 3),
    ('SALON', 'Química & coloração', 'Matizador roxo', 'Neutralização de amarelado.', 4),
    ('SALON', 'Química & coloração', 'Revelador creme 30 vol', 'Levantamento de tom.', 5),
    ('SALON', 'Química & coloração', 'Coloração sem amônia', 'Cliente sensível.', 6),
    ('SALON', 'Química & coloração', 'Água oxigenada 10 vol', 'Retoque de raiz.', 7),
    ('SALON', 'Tratamentos', 'Ampola capilar reconstrução', 'Emergência pós-química.', 1),
    ('SALON', 'Tratamentos', 'Botox capilar passo único', 'Alisamento temporário e brilho.', 2),
    ('SALON', 'Tratamentos', 'Hidratação profunda 500g', 'Banho de creme salão.', 3),
    ('SALON', 'Tratamentos', 'Reconstrutor com queratina', 'Força aos fios.', 4),
    ('SALON', 'Tratamentos', 'Banho de brilho', 'Antes de eventos.', 5),
    ('SALON', 'Tratamentos', 'Cronograma capilar (kit)', 'Nutri/hidra/reconstrói.', 6),
    ('SALON', 'Tratamentos', 'Óleo finalizador profissional', 'Poucas gotas no acabamento.', 7),
    ('SALON', 'Equipamentos profissionais', 'Secador 2200W', 'Fluxo de salão em Savassi/Pampulha.', 1),
    ('SALON', 'Equipamentos profissionais', 'Chapinha cerâmica larga', 'Alisamento express.', 2),
    ('SALON', 'Equipamentos profissionais', 'Escova rotativa', 'Brush e volume.', 3),
    ('SALON', 'Equipamentos profissionais', 'Baby lis / modelador', 'Cachos e ondas.', 4),
    ('SALON', 'Equipamentos profissionais', 'Touca térmica descartável', 'Tratamentos com calor.', 5),
    ('SALON', 'Equipamentos profissionais', 'Bob com presilhas', 'Coloração e mechas.', 6),
    ('SALON', 'Equipamentos profissionais', 'Pente carbono afinação', 'Deslize em cabelo tratado.', 7),
    ('SALON', 'Equipamentos profissionais', 'Spray borrifador 300ml', 'Umidificar antes do corte.', 8),
    ('MANICURE', 'Esmaltes & finalização', 'Esmalte em gel top coat', 'Selagem brilho — alta rotatividade.', 1),
    ('MANICURE', 'Esmaltes & finalização', 'Esmaltação gel cor nude', 'Tom mais pedido em manicures BH.', 2),
    ('MANICURE', 'Esmaltes & finalização', 'Esmalte tradicional vermelho', 'Clássico semanal.', 3),
    ('MANICURE', 'Esmaltes & finalização', 'Base fortalecedora', 'Unhas fracas.', 4),
    ('MANICURE', 'Esmaltes & finalização', 'Efeito matte top', 'Acabamento fosco.', 5),
    ('MANICURE', 'Esmaltes & finalização', 'Gel builder clear', 'Construção transparente.', 6),
    ('MANICURE', 'Esmaltes & finalização', 'Glitter gel', 'Decoração rápida.', 7),
    ('MANICURE', 'Esmaltes & finalização', 'Esmalte gel branco leite', 'French e baby boomer.', 8),
    ('MANICURE', 'Alongamento de unhas', 'Gel construtor UV', 'Alongamento estrutural.', 1),
    ('MANICURE', 'Alongamento de unhas', 'Tips alongamento natural', 'Formato coffin/stiletto.', 2),
    ('MANICURE', 'Alongamento de unhas', 'Fibra de vidro para unhas', 'Reforço flexível.', 3),
    ('MANICURE', 'Alongamento de unhas', 'Lixa 100/180 profissional', 'Consumo diário.', 4),
    ('MANICURE', 'Alongamento de unhas', 'Primer unha gel', 'Adesão.', 5),
    ('MANICURE', 'Alongamento de unhas', 'Bond / dehydrator', 'Preparação da lâmina.', 6),
    ('MANICURE', 'Alongamento de unhas', 'Forma adesiva molde F', 'Alongamento sem tips.', 7),
    ('MANICURE', 'Cuidados & preparação', 'Óleo hidratante cutículas', 'Finalização de esmaltação.', 1),
    ('MANICURE', 'Cuidados & preparação', 'Creme mãos UVA/UVB', 'Cliente pós-esmaltação.', 2),
    ('MANICURE', 'Cuidados & preparação', 'Removedor acetona 500ml', 'Remoção de gel.', 3),
    ('MANICURE', 'Cuidados & preparação', 'Hidratante pés 500g', 'Spa dos pés.', 4),
    ('MANICURE', 'Cuidados & preparação', 'Lixa buffer polimento', 'Acabamento natural.', 5),
    ('MANICURE', 'Cuidados & preparação', 'Espátula cutícula inox', 'Preparação.', 6),
    ('MANICURE', 'Cuidados & preparação', 'Sabonete espuma mãos', 'Higiene pré-atendimento.', 7),
    ('MANICURE', 'Equipamentos & acessórios', 'Cabine LED/UV 48W', 'Cura de gel — equipamento padrão.', 1),
    ('MANICURE', 'Equipamentos & acessórios', 'Lixadeira elétrica unha', 'Lixamento e acabamento.', 2),
    ('MANICURE', 'Equipamentos & acessórios', 'Kit brocas lixadeira', 'Reposição.', 3),
    ('MANICURE', 'Equipamentos & acessórios', 'Separador de dedos silicone', 'Pedicure.', 4),
    ('MANICURE', 'Equipamentos & acessórios', 'Palito laranjeira caixa', 'Consumo.', 5),
    ('MANICURE', 'Equipamentos & acessórios', 'Algodão hidrófilo 500g', 'Remoção e prep.', 6),
    ('MANICURE', 'Equipamentos & acessórios', 'Pinça strass nail art', 'Decoração.', 7),
    ('MANICURE', 'Equipamentos & acessórios', 'Pincel gel nº 4', 'Construção e nivelamento.', 8)
)
INSERT INTO public.product_catalog_items (category_id, name, description, sort_order, default_image)
SELECT
  c.id,
  r.name,
  r.description,
  r.sort_order,
  'https://images.unsplash.com/photo-1590159763121-7c9fd312190d?q=80&w=400&auto=format&fit=crop'
FROM catalog_seed_rows r
JOIN ins_cat c ON c.shop_type = r.shop_type AND c.name = r.cat_name
ON CONFLICT (category_id, name) DO NOTHING;
