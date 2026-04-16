-- =============================================================================
-- Repor loja + perfil dono (template idempotente — edite variáveis no bloco)
-- =============================================================================
--
-- Pré-requisito: usuário já existe em Authentication (mesmo e-mail que v_owner_email).
-- Se a loja com v_shop_email já existir: só sincroniza profiles (não duplica shop).
--
-- IDs Asaas abaixo são EXEMPLO do fluxo antigo; substitua pelos da SUA subconta
-- ou deixe NULL se ainda não tiver provisionado.
--
-- NÃO commite segredos reais.
-- =============================================================================

DO $$
DECLARE
  v_owner_email       text := 'dk@gmail.com';
  v_shop_email        text := 'dk@gmail.com';
  v_shop_name         text := 'Barbearia D_K';
  v_phone             text := '31985125108';
  v_cnpj_cpf          text := '14028066638';
  v_address           text := 'Rua Antônio Olinto Ferreira, 53, Bom Jesus, Contagem, MG, 32185-410';
  v_asaas_account_id  text := NULL; -- ex.: UUID subconta Asaas
  v_asaas_wallet_id   text := NULL; -- ex.: UUID carteira split
  OWNER_UUID          uuid;
  existing_shop_id    uuid;
  new_shop_id         uuid;
BEGIN
  SELECT id INTO OWNER_UUID FROM auth.users WHERE email = v_owner_email LIMIT 1;
  IF OWNER_UUID IS NULL THEN
    RAISE EXCEPTION 'Crie primeiro o usuário % em Authentication → Users.', v_owner_email;
  END IF;

  SELECT id INTO existing_shop_id
  FROM public.shops
  WHERE lower(btrim(email)) = lower(btrim(v_shop_email))
  LIMIT 1;

  IF existing_shop_id IS NOT NULL THEN
    RAISE NOTICE 'Loja já existe (id=%). Atualizando apenas profiles.shop_id.', existing_shop_id;
    INSERT INTO public.profiles (id, role, shop_id)
    VALUES (OWNER_UUID, 'barbearia', existing_shop_id)
    ON CONFLICT (id) DO UPDATE SET role = 'barbearia', shop_id = excluded.shop_id;
    RETURN;
  END IF;

  INSERT INTO public.shops (
    owner_id,
    name,
    type,
    email,
    phone,
    cnpj_cpf,
    address,
    asaas_account_id,
    asaas_wallet_id,
    subscription_active,
    subscription_amount
  ) VALUES (
    OWNER_UUID,
    v_shop_name,
    'BARBER',
    v_shop_email,
    v_phone,
    v_cnpj_cpf,
    v_address,
    v_asaas_account_id,
    v_asaas_wallet_id,
    true,
    99.00
  )
  RETURNING id INTO new_shop_id;

  INSERT INTO public.profiles (id, role, shop_id)
  VALUES (OWNER_UUID, 'barbearia', new_shop_id)
  ON CONFLICT (id) DO UPDATE SET role = 'barbearia', shop_id = excluded.shop_id;

  RAISE NOTICE 'Loja criada id=% para owner=%.', new_shop_id, v_owner_email;
END $$;
