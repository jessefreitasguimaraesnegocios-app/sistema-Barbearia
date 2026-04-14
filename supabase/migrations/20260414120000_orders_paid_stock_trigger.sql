-- Baixa de estoque no momento em que o pedido passa a PAID (mesma transação do UPDATE).
-- Corrige falhas da RPC apply_product_stock_for_asaas_payment, que inseria idempotência
-- antes de processar linhas — se não houvesse pedido PAID visível, o estoque nunca baixava.

CREATE TABLE IF NOT EXISTS public.order_stock_deductions (
  order_id uuid NOT NULL PRIMARY KEY REFERENCES public.orders (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_stock_deductions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.order_stock_deductions IS 'Garante idempotência da baixa de estoque por pedido (uma vez por order_id).';

REVOKE ALL ON TABLE public.order_stock_deductions FROM PUBLIC;
GRANT ALL ON TABLE public.order_stock_deductions TO service_role;

CREATE OR REPLACE FUNCTION public.orders_deduct_product_stock_on_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem jsonb;
  pid uuid;
  qty int;
  raw_pid text;
  inserted int;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'PAID' OR OLD.status IS NOT DISTINCT FROM 'PAID' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_stock_deductions (order_id)
  VALUES (NEW.id)
  ON CONFLICT (order_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    raw_pid := COALESCE(NULLIF(trim(elem->>'productId'), ''), NULLIF(trim(elem->>'product_id'), ''));
    IF raw_pid IS NULL OR raw_pid = '' THEN
      CONTINUE;
    END IF;
    BEGIN
      pid := raw_pid::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        CONTINUE;
    END;
    qty := COALESCE((elem->>'quantity')::int, (elem->>'qty')::int, 0);
    IF qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.products p
    SET stock = greatest(0, coalesce(p.stock, 0) - qty)
    WHERE p.id = pid AND p.shop_id = NEW.shop_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_deduct_product_stock_on_paid ON public.orders;
CREATE TRIGGER trg_orders_deduct_product_stock_on_paid
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.orders_deduct_product_stock_on_paid();

REVOKE ALL ON FUNCTION public.orders_deduct_product_stock_on_paid() FROM PUBLIC;

COMMENT ON FUNCTION public.orders_deduct_product_stock_on_paid IS 'Baixa estoque dos itens JSON do pedido na primeira transição para PAID.';

-- RPC antiga: evita segunda baixa se o webhook ainda a chamar; estoque fica só no trigger.
CREATE OR REPLACE FUNCTION public.apply_product_stock_for_asaas_payment(p_payment_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Implementação anterior (insert em asaas_payment_stock_processed antes do loop) podia
  -- “travar” o pagamento sem baixar estoque. A baixa é feita por trg_orders_deduct_product_stock_on_paid.
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RETURN;
  END IF;
  NULL;
END;
$$;

COMMENT ON FUNCTION public.apply_product_stock_for_asaas_payment(text) IS 'No-op: baixa de estoque em pedidos PAID via trigger orders_deduct_product_stock_on_paid.';
