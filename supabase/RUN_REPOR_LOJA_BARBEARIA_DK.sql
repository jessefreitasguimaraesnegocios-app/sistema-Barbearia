-- Repor dados da loja Barbearia D_K com subconta Asaas existente.
-- Pré-requisito: usuário dk@gmail.com já criado em Authentication → Users.
-- O script busca o UUID desse usuário e usa como owner_id.

DO $$
DECLARE
  OWNER_UUID UUID;
  new_shop_id UUID;
BEGIN
  SELECT id INTO OWNER_UUID FROM auth.users WHERE email = 'dk@gmail.com' LIMIT 1;
  IF OWNER_UUID IS NULL THEN
    RAISE EXCEPTION 'Crie primeiro o usuário com email dk@gmail.com em Authentication → Users → Add user';
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
    'Barbearia D_K',
    'BARBER',
    'dk@gmail.com',
    '31985125108',
    '14028066638',
    'Rua Antônio Olinto Ferreira, 53, Bom Jesus, Contagem, MG, 32185-410',
    '86349c7e-1e82-478c-9b4c-a7d04544bdb8',
    '71140c96-bf08-421b-8590-99a8e7cbcb96',
    true,
    99.00
  )
  RETURNING id INTO new_shop_id;

  INSERT INTO public.profiles (id, role, shop_id)
  VALUES (OWNER_UUID, 'barbearia', new_shop_id)
  ON CONFLICT (id) DO UPDATE SET role = 'barbearia', shop_id = new_shop_id;
END $$;
