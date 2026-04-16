-- Provisionamento Asaas: colunas finance_provision_* saem de `shops` para tabela 1:1
-- (menos largura por linha em `shops`; payload JSONB só nesta tabela).

CREATE TABLE IF NOT EXISTS public.shop_finance_provision (
  shop_id uuid PRIMARY KEY REFERENCES public.shops (id) ON DELETE CASCADE,
  finance_provision_status text NOT NULL DEFAULT 'pending'
    CHECK (
      finance_provision_status IN (
        'pending',
        'processing',
        'awaiting_callback',
        'active',
        'failed'
      )
    ),
  finance_provision_attempts integer NOT NULL DEFAULT 0,
  finance_provision_last_error text,
  finance_provision_updated_at timestamptz,
  finance_provision_correlation_id text,
  finance_provision_payload jsonb
);

COMMENT ON TABLE public.shop_finance_provision IS
  'Estado e payload de provisionamento Asaas (1:1 com shops).';

COMMENT ON COLUMN public.shop_finance_provision.finance_provision_payload IS
  'Snapshot do cadastro para provisionamento Asaas (birthDate, companyType, postalCode, addressNumber, etc.).';

COMMENT ON COLUMN public.shop_finance_provision.finance_provision_status IS
  'pending=aguardando worker; processing=em execução; awaiting_callback=externo; active=pronto para split; failed=erro (retry manual).';

INSERT INTO public.shop_finance_provision (
  shop_id,
  finance_provision_status,
  finance_provision_attempts,
  finance_provision_last_error,
  finance_provision_updated_at,
  finance_provision_correlation_id,
  finance_provision_payload
)
SELECT
  s.id,
  s.finance_provision_status,
  s.finance_provision_attempts,
  s.finance_provision_last_error,
  s.finance_provision_updated_at,
  s.finance_provision_correlation_id,
  s.finance_provision_payload
FROM public.shops s
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_finance_provision p WHERE p.shop_id = s.id
);

CREATE INDEX IF NOT EXISTS idx_shop_finance_provision_pending
  ON public.shop_finance_provision (finance_provision_status)
  WHERE finance_provision_status IN ('pending', 'failed');

DROP INDEX IF EXISTS public.idx_shops_finance_provision_pending;

ALTER TABLE public.shops
  DROP COLUMN IF EXISTS finance_provision_status,
  DROP COLUMN IF EXISTS finance_provision_attempts,
  DROP COLUMN IF EXISTS finance_provision_last_error,
  DROP COLUMN IF EXISTS finance_provision_updated_at,
  DROP COLUMN IF EXISTS finance_provision_correlation_id,
  DROP COLUMN IF EXISTS finance_provision_payload;

-- Parceiro: Realtime em `shops` continua a disparar quando o provisionamento muda
-- (useShop refaz fetch com embed `shop_finance_provision`).
CREATE OR REPLACE FUNCTION public.touch_shops_updated_at_from_shop_finance_provision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shops SET updated_at = NOW() WHERE id = NEW.shop_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_shops_updated_at_from_shop_finance_provision() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_shop_finance_provision_touch_shop_updated_at ON public.shop_finance_provision;
CREATE TRIGGER trg_shop_finance_provision_touch_shop_updated_at
AFTER INSERT OR UPDATE ON public.shop_finance_provision
FOR EACH ROW
EXECUTE PROCEDURE public.touch_shops_updated_at_from_shop_finance_provision();

ALTER TABLE public.shop_finance_provision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_finance_provision_select_owner" ON public.shop_finance_provision;
CREATE POLICY "shop_finance_provision_select_owner"
  ON public.shop_finance_provision
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_finance_provision.shop_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shop_finance_provision_select_staff" ON public.shop_finance_provision;
CREATE POLICY "shop_finance_provision_select_staff"
  ON public.shop_finance_provision
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND pr.shop_id = shop_finance_provision.shop_id
    )
  );

REVOKE ALL ON public.shop_finance_provision FROM PUBLIC;
REVOKE ALL ON public.shop_finance_provision FROM anon;
GRANT SELECT ON public.shop_finance_provision TO authenticated;
GRANT ALL ON public.shop_finance_provision TO service_role;
