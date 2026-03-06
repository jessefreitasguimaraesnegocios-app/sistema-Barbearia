-- Porcentagem do valor do pagamento que vai para a loja no split Asaas (0–100). Default 95.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS split_percent DECIMAL(5,2) DEFAULT 95.00;
COMMENT ON COLUMN shops.split_percent IS 'Percentual (0-100) do pagamento que a loja recebe no split Asaas';

-- Permitir exclusão de loja: ao excluir shop, appointments da loja são removidos
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_shop_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_shop_id_fkey
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;
