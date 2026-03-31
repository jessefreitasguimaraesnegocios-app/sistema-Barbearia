-- Suporte a subconta Asaas por profissional (e split individual).
ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS asaas_account_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_api_key TEXT,
ADD COLUMN IF NOT EXISTS asaas_environment TEXT CHECK (asaas_environment IN ('sandbox', 'production')),
ADD COLUMN IF NOT EXISTS split_percent DECIMAL(5,2);

CREATE INDEX IF NOT EXISTS idx_professionals_shop_id ON professionals(shop_id);
CREATE INDEX IF NOT EXISTS idx_professionals_asaas_wallet_id ON professionals(asaas_wallet_id);

COMMENT ON COLUMN professionals.split_percent IS
'Percentual (0-100) do split que o profissional recebe em serviços.';
