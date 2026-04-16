-- =============================================================================
-- Atualizar asaas_api_key de UMA loja (template — edite as variáveis abaixo)
-- =============================================================================
--
-- NÃO commite chave real neste arquivo.
-- Dashboard → SQL Editor → ajuste v_shop_email e v_api_key → Run
--
-- Como obter a chave: Asaas → Integrações → Chaves de API (subconta, se for o caso).
-- =============================================================================

DO $$
DECLARE
  v_shop_email text := 'dk@gmail.com';              -- e-mail da loja em public.shops.email
  v_api_key    text := 'COLE_A_CHAVE_DA_SUBCONTA_AQUI';
BEGIN
  IF v_api_key IS NULL OR btrim(v_api_key) = '' OR v_api_key = 'COLE_A_CHAVE_DA_SUBCONTA_AQUI' THEN
    RAISE EXCEPTION 'Defina v_api_key com a chave Asaas antes de executar.';
  END IF;

  UPDATE public.shops
  SET asaas_api_key = v_api_key
  WHERE lower(btrim(email)) = lower(btrim(v_shop_email));

  IF NOT FOUND THEN
    RAISE NOTICE 'Nenhuma linha em public.shops com email=%. Nada atualizado.', v_shop_email;
  ELSE
    RAISE NOTICE 'asaas_api_key atualizado para loja email=%.', v_shop_email;
  END IF;
END $$;
