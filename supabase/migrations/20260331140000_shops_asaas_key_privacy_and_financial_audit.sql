-- 1) Flag pública: se a loja tem chave Asaas configurada (sem expor o segredo)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS asaas_api_key_configured BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE shops
SET asaas_api_key_configured = (asaas_api_key IS NOT NULL AND btrim(asaas_api_key) <> '');

CREATE OR REPLACE FUNCTION public.shops_set_asaas_api_key_configured()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.asaas_api_key_configured := (NEW.asaas_api_key IS NOT NULL AND btrim(NEW.asaas_api_key) <> '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shops_asaas_api_key_configured ON shops;
CREATE TRIGGER trg_shops_asaas_api_key_configured
  BEFORE INSERT OR UPDATE OF asaas_api_key ON shops
  FOR EACH ROW
  EXECUTE PROCEDURE public.shops_set_asaas_api_key_configured();

COMMENT ON COLUMN shops.asaas_api_key_configured IS 'Sincronizado por trigger; use no SELECT do front em vez de asaas_api_key.';

-- 2) Coluna sensível: só service_role lê/atualiza diretamente (cliente nunca vê a chave)
REVOKE SELECT (asaas_api_key) ON shops FROM PUBLIC;
REVOKE UPDATE (asaas_api_key) ON shops FROM PUBLIC;
REVOKE SELECT (asaas_api_key) ON shops FROM anon;
REVOKE UPDATE (asaas_api_key) ON shops FROM anon;
REVOKE SELECT (asaas_api_key) ON shops FROM authenticated;
REVOKE UPDATE (asaas_api_key) ON shops FROM authenticated;

GRANT SELECT (asaas_api_key), UPDATE (asaas_api_key) ON shops TO service_role;

-- 3) Auditoria mínima de ações financeiras (somente backend com service role)
CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  amount NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  result TEXT NOT NULL,
  asaas_transfer_id TEXT,
  error_message TEXT,
  metadata JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_shop_created
  ON financial_audit_logs (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_action_created
  ON financial_audit_logs (action, created_at DESC);

COMMENT ON TABLE financial_audit_logs IS 'Eventos financeiros (saques, troca de chave API, etc.); inserção só via service role.';

ALTER TABLE financial_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON financial_audit_logs FROM PUBLIC;
REVOKE ALL ON financial_audit_logs FROM anon;
REVOKE ALL ON financial_audit_logs FROM authenticated;
GRANT SELECT, INSERT ON financial_audit_logs TO service_role;
