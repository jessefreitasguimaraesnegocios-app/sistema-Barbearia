-- Salvar customerId retornado pela API Asaas (clientes) na tabela shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;
