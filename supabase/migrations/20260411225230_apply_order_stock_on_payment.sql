-- Idempotência por payment_id: PAYMENT_RECEIVED e PAYMENT_CONFIRMED não baixam estoque duas vezes.
CREATE TABLE IF NOT EXISTS public.asaas_payment_stock_processed (
  payment_id text NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asaas_payment_stock_processed ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.asaas_payment_stock_processed IS 'Marca pagamento Asaas já processado para baixa de estoque (pedidos PAID).';

REVOKE ALL ON TABLE public.asaas_payment_stock_processed FROM PUBLIC;
GRANT ALL ON TABLE public.asaas_payment_stock_processed TO service_role;

CREATE OR REPLACE FUNCTION public.apply_product_stock_for_asaas_payment(p_payment_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int;
  r record;
  elem jsonb;
  pid uuid;
  qty int;
  raw_pid text;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.asaas_payment_stock_processed (payment_id) VALUES (btrim(p_payment_id))
  ON CONFLICT (payment_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, shop_id, items
    FROM public.orders
    WHERE asaas_payment_id = btrim(p_payment_id)
      AND status = 'PAID'
  LOOP
    IF r.items IS NULL OR jsonb_typeof(r.items) <> 'array' THEN
      CONTINUE;
    END IF;
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      raw_pid := elem->>'productId';
      IF raw_pid IS NULL OR raw_pid = '' THEN
        raw_pid := elem->>'product_id';
      END IF;
      IF raw_pid IS NULL OR raw_pid = '' THEN
        CONTINUE;
      END IF;
      BEGIN
        pid := raw_pid::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
      END;
      qty := COALESCE((elem->>'quantity')::int, 0);
      IF qty <= 0 THEN
        CONTINUE;
      END IF;

      UPDATE public.products p
      SET stock = GREATEST(0, COALESCE(p.stock, 0) - qty)
      WHERE p.id = pid AND p.shop_id = r.shop_id;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_product_stock_for_asaas_payment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_product_stock_for_asaas_payment(text) TO service_role;

COMMENT ON FUNCTION public.apply_product_stock_for_asaas_payment IS 'Baixa estoque dos itens dos pedidos PAID vinculados ao payment_id; idempotente por pagamento.';
