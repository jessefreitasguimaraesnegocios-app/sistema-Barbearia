-- Catálogo cliente: marca de tempo única por loja para sync incremental + cache no browser.
-- Qualquer mudança em services/professionals/products atualiza shops.updated_at (via trigger).

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Sobrescreve o default de migração: fica alinhado ao histórico real da loja.
UPDATE public.shops
SET updated_at = COALESCE(created_at, updated_at);

CREATE INDEX IF NOT EXISTS idx_shops_catalog_updated_at ON public.shops (updated_at);

CREATE OR REPLACE FUNCTION public.touch_shops_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shops_touch_updated_at ON public.shops;
CREATE TRIGGER trg_shops_touch_updated_at
BEFORE UPDATE ON public.shops
FOR EACH ROW
EXECUTE PROCEDURE public.touch_shops_row_updated_at();

-- Quando o catálogo filho muda, a linha da loja “pulsa” updated_at para o front refetch incremental.
CREATE OR REPLACE FUNCTION public.bump_shop_catalog_updated_at_from_child()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  sid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    sid := OLD.shop_id;
  ELSE
    sid := NEW.shop_id;
  END IF;
  IF sid IS NOT NULL THEN
    UPDATE public.shops SET updated_at = NOW() WHERE id = sid;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_bump_shop_updated_at ON public.services;
CREATE TRIGGER trg_services_bump_shop_updated_at
AFTER INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW
EXECUTE PROCEDURE public.bump_shop_catalog_updated_at_from_child();

DROP TRIGGER IF EXISTS trg_professionals_bump_shop_updated_at ON public.professionals;
CREATE TRIGGER trg_professionals_bump_shop_updated_at
AFTER INSERT OR UPDATE OR DELETE ON public.professionals
FOR EACH ROW
EXECUTE PROCEDURE public.bump_shop_catalog_updated_at_from_child();

DROP TRIGGER IF EXISTS trg_products_bump_shop_updated_at ON public.products;
CREATE TRIGGER trg_products_bump_shop_updated_at
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW
EXECUTE PROCEDURE public.bump_shop_catalog_updated_at_from_child();
