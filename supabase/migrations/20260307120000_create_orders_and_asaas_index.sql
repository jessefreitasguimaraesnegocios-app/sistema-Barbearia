-- Tabela orders (pedidos da lojinha) com vínculo ao pagamento Asaas
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  total DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'DELIVERED')),
  asaas_payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_asaas_payment_id ON orders(asaas_payment_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own orders" ON orders;
CREATE POLICY "Users can read own orders" ON orders FOR SELECT USING (auth.uid() = client_id);
-- Inserção/atualização via service role (create-payment e webhook)
-- Dono da loja pode ler pedidos da loja (opcional para dashboard)
DROP POLICY IF EXISTS "Shop owner can read shop orders" ON orders;
CREATE POLICY "Shop owner can read shop orders" ON orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM shops WHERE shops.id = orders.shop_id AND shops.owner_id = auth.uid())
);

-- Appointments: permitir leitura por cliente e por dono da loja (já existe policy de update?)
-- Garantir índice para webhook buscar por asaas_payment_id
CREATE INDEX IF NOT EXISTS idx_appointments_asaas_payment_id ON appointments(asaas_payment_id);

-- RLS em appointments: cliente lê os próprios; dono da loja lê os da loja
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own appointments" ON appointments;
CREATE POLICY "Users can read own appointments" ON appointments FOR SELECT USING (auth.uid() = client_id);
DROP POLICY IF EXISTS "Shop owner can read shop appointments" ON appointments;
CREATE POLICY "Shop owner can read shop appointments" ON appointments FOR SELECT USING (
  EXISTS (SELECT 1 FROM shops WHERE shops.id = appointments.shop_id AND shops.owner_id = auth.uid())
);

-- Opcional: em Dashboard > Database > Replication, adicione appointments e orders à publicação supabase_realtime para atualização em tempo real quando o webhook marcar PAID.
