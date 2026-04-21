-- Chaves da subconta Asaas por ambiente em shops (produção/sandbox)
-- Mantém compatibilidade com shops.asaas_api_key (legado)

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS asaas_api_key_prod TEXT,
  ADD COLUMN IF NOT EXISTS asaas_api_key_sandbox TEXT;

UPDATE public.shops
SET
  asaas_api_key_prod = COALESCE(NULLIF(btrim(asaas_api_key_prod), ''), NULLIF(btrim(asaas_api_key), '')),
  asaas_api_key_sandbox = COALESCE(NULLIF(btrim(asaas_api_key_sandbox), ''), NULLIF(btrim(asaas_api_key), ''))
WHERE
  (asaas_api_key_prod IS NULL OR btrim(asaas_api_key_prod) = '')
  OR (asaas_api_key_sandbox IS NULL OR btrim(asaas_api_key_sandbox) = '');

CREATE OR REPLACE FUNCTION public.shops_set_asaas_api_key_configured()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.asaas_api_key_configured :=
    (
      (NEW.asaas_api_key IS NOT NULL AND btrim(NEW.asaas_api_key) <> '')
      OR (NEW.asaas_api_key_prod IS NOT NULL AND btrim(NEW.asaas_api_key_prod) <> '')
      OR (NEW.asaas_api_key_sandbox IS NOT NULL AND btrim(NEW.asaas_api_key_sandbox) <> '')
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shops_asaas_api_key_configured ON public.shops;
CREATE TRIGGER trg_shops_asaas_api_key_configured
  BEFORE INSERT OR UPDATE OF asaas_api_key, asaas_api_key_prod, asaas_api_key_sandbox ON public.shops
  FOR EACH ROW
  EXECUTE PROCEDURE public.shops_set_asaas_api_key_configured();

COMMENT ON COLUMN public.shops.asaas_api_key_prod IS 'Chave API da subconta Asaas em produção (somente service_role).';
COMMENT ON COLUMN public.shops.asaas_api_key_sandbox IS 'Chave API da subconta Asaas em sandbox (somente service_role).';

REVOKE SELECT (asaas_api_key_prod) ON public.shops FROM PUBLIC;
REVOKE UPDATE (asaas_api_key_prod) ON public.shops FROM PUBLIC;
REVOKE SELECT (asaas_api_key_prod) ON public.shops FROM anon;
REVOKE UPDATE (asaas_api_key_prod) ON public.shops FROM anon;
REVOKE SELECT (asaas_api_key_prod) ON public.shops FROM authenticated;
REVOKE UPDATE (asaas_api_key_prod) ON public.shops FROM authenticated;

REVOKE SELECT (asaas_api_key_sandbox) ON public.shops FROM PUBLIC;
REVOKE UPDATE (asaas_api_key_sandbox) ON public.shops FROM PUBLIC;
REVOKE SELECT (asaas_api_key_sandbox) ON public.shops FROM anon;
REVOKE UPDATE (asaas_api_key_sandbox) ON public.shops FROM anon;
REVOKE SELECT (asaas_api_key_sandbox) ON public.shops FROM authenticated;
REVOKE UPDATE (asaas_api_key_sandbox) ON public.shops FROM authenticated;

GRANT SELECT (asaas_api_key_prod), UPDATE (asaas_api_key_prod) ON public.shops TO service_role;
GRANT SELECT (asaas_api_key_sandbox), UPDATE (asaas_api_key_sandbox) ON public.shops TO service_role;
