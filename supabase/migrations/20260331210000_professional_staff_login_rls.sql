-- Papel profissional (funcionário da barbearia), vínculo perfil↔professional, chave Asaas privada na subconta do profissional, RLS.

-- 1) professionals: login e chave Asaas (chave só service_role — espelha shops.asaas_api_key)
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_user_id_unique
  ON professionals(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS asaas_api_key TEXT;

COMMENT ON COLUMN professionals.user_id IS 'Usuário Auth vinculado ao profissional (área parceiro como funcionário).';
COMMENT ON COLUMN professionals.asaas_api_key IS 'Chave API da subconta Asaas do profissional; não expor ao cliente (só service_role).';

REVOKE SELECT (asaas_api_key) ON professionals FROM PUBLIC;
REVOKE UPDATE (asaas_api_key) ON professionals FROM PUBLIC;
REVOKE SELECT (asaas_api_key) ON professionals FROM anon;
REVOKE UPDATE (asaas_api_key) ON professionals FROM anon;
REVOKE SELECT (asaas_api_key) ON professionals FROM authenticated;
REVOKE UPDATE (asaas_api_key) ON professionals FROM authenticated;

GRANT SELECT (asaas_api_key), UPDATE (asaas_api_key) ON professionals TO service_role;

-- 2) profiles: role profissional + professional_id
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'barbearia', 'cliente', 'profissional'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_professional_id ON profiles(professional_id);

COMMENT ON COLUMN profiles.professional_id IS 'Quando role=profissional, linha em professionals correspondente ao login.';

-- 3) appointments: funcionário lê/atualiza só os próprios agendamentos na loja
CREATE POLICY "Shop staff can read shop appointments" ON appointments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = appointments.shop_id
        AND p.professional_id IS NOT NULL
        AND p.professional_id = appointments.professional_id
    )
  );

CREATE POLICY "Shop staff can update shop appointments" ON appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = appointments.shop_id
        AND p.professional_id IS NOT NULL
        AND p.professional_id = appointments.professional_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = appointments.shop_id
        AND p.professional_id IS NOT NULL
        AND p.professional_id = appointments.professional_id
    )
  );

-- 4) orders: funcionário da loja lê pedidos e marca entregue (como o dono)
CREATE POLICY "Shop staff can read shop orders" ON orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = orders.shop_id
    )
  );

CREATE POLICY "Shop staff can mark orders delivered" ON orders
  FOR UPDATE
  TO authenticated
  USING (
    status = 'PAID'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = orders.shop_id
    )
  )
  WITH CHECK (
    status = 'DELIVERED'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'profissional'
        AND p.shop_id = orders.shop_id
    )
  );

-- 5) profiles: funcionário lê clientes dos seus agendamentos (nome/telefone na agenda)
CREATE POLICY "Shop staff can read profiles of appointment clients" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      INNER JOIN profiles staff ON staff.id = auth.uid()
      WHERE staff.role = 'profissional'
        AND staff.shop_id = a.shop_id
        AND staff.professional_id IS NOT NULL
        AND staff.professional_id = a.professional_id
        AND a.client_id = profiles.id
    )
  );

-- 6) profiles: funcionário lê clientes que fizeram pedido na mesma loja (tela pedidos)
CREATE POLICY "Shop staff can read profiles of ordering clients" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      INNER JOIN profiles staff ON staff.id = auth.uid()
      WHERE staff.role = 'profissional'
        AND staff.shop_id = o.shop_id
        AND o.client_id = profiles.id
    )
  );
