-- Tabela products (lojinha) por loja
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  promo_price DECIMAL(10,2),
  category TEXT DEFAULT 'Geral',
  image TEXT,
  stock INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);

-- Leitura pública para clientes verem a lojinha
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (true);
-- Dono da loja pode gerenciar (via owner_id na shops)
DROP POLICY IF EXISTS "Shop owner can manage products" ON products;
CREATE POLICY "Shop owner can manage products" ON products FOR ALL USING (
  EXISTS (SELECT 1 FROM shops WHERE shops.id = products.shop_id AND shops.owner_id = auth.uid())
);

-- Policies para services e professionals (leitura pública, escrita pelo dono)
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Services are viewable by everyone" ON services;
CREATE POLICY "Services are viewable by everyone" ON services FOR SELECT USING (true);
DROP POLICY IF EXISTS "Shop owner can manage services" ON services;
CREATE POLICY "Shop owner can manage services" ON services FOR ALL USING (
  EXISTS (SELECT 1 FROM shops WHERE shops.id = services.shop_id AND shops.owner_id = auth.uid())
);

ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Professionals are viewable by everyone" ON professionals;
CREATE POLICY "Professionals are viewable by everyone" ON professionals FOR SELECT USING (true);
DROP POLICY IF EXISTS "Shop owner can manage professionals" ON professionals;
CREATE POLICY "Shop owner can manage professionals" ON professionals FOR ALL USING (
  EXISTS (SELECT 1 FROM shops WHERE shops.id = professionals.shop_id AND shops.owner_id = auth.uid())
);
