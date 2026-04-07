-- Mensalidade da plataforma (conta Asaas mãe): liga loja à assinatura criada no Asaas (manual ou API).
-- O webhook asaas-webhook usa este id para marcar subscription_active quando o pagamento da assinatura confirma.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS asaas_platform_subscription_id TEXT;

COMMENT ON COLUMN shops.asaas_platform_subscription_id IS
  'ID da assinatura na conta Asaas principal (mensalidade do estabelecimento). Webhook sincroniza subscription_active.';

CREATE INDEX IF NOT EXISTS idx_shops_asaas_platform_subscription_id
  ON shops (asaas_platform_subscription_id)
  WHERE asaas_platform_subscription_id IS NOT NULL AND asaas_platform_subscription_id <> '';

-- Anti-replay para eventos de webhook que não trazem payment_id (ex.: SUBSCRIPTION_DELETED)
CREATE TABLE IF NOT EXISTS asaas_subscription_webhook_receipts (
  event TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event, subscription_id)
);
