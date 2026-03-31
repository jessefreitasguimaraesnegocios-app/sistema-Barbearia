-- Estado de provisionamento financeiro (Asaas) desacoplado do cadastro da loja
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS finance_provision_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (finance_provision_status IN (
      'pending',
      'processing',
      'awaiting_callback',
      'active',
      'failed'
    )),
  ADD COLUMN IF NOT EXISTS finance_provision_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finance_provision_last_error TEXT,
  ADD COLUMN IF NOT EXISTS finance_provision_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finance_provision_correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS finance_provision_payload JSONB;

COMMENT ON COLUMN shops.finance_provision_payload IS 'Snapshot do cadastro para provisionamento Asaas (birthDate, companyType, postalCode, addressNumber, etc.).';

CREATE INDEX IF NOT EXISTS idx_shops_finance_provision_pending
  ON shops (finance_provision_status)
  WHERE finance_provision_status IN ('pending', 'failed');

COMMENT ON COLUMN shops.finance_provision_status IS 'pending=aguardando worker; processing=em execução; awaiting_callback=externo; active=pronto para split; failed=erro (retry manual).';

-- Lojas já com carteira: considerar provisionamento concluído
UPDATE shops
SET
  finance_provision_status = 'active',
  finance_provision_updated_at = COALESCE(finance_provision_updated_at, NOW())
WHERE asaas_wallet_id IS NOT NULL
  AND btrim(asaas_wallet_id) <> ''
  AND finance_provision_status = 'pending';
