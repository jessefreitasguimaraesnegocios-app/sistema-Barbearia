-- RLS em profiles: políticas simples, sem subselect em profiles (evita 42P17 / 500).
-- Staff: vínculo só via public.professionals (user_id = auth.uid()).
-- Remove dependência de auth_professional_context() (que lia profiles de dentro de policies).

-- ---------------------------------------------------------------------------
-- appointments / orders: staff via professionals (sem função, sem profiles)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Shop staff can read shop appointments" ON public.appointments;
CREATE POLICY "Shop staff can read shop appointments" ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = appointments.shop_id
        AND pr.id = appointments.professional_id
    )
  );

DROP POLICY IF EXISTS "Shop staff can update shop appointments" ON public.appointments;
CREATE POLICY "Shop staff can update shop appointments" ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = appointments.shop_id
        AND pr.id = appointments.professional_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = appointments.shop_id
        AND pr.id = appointments.professional_id
    )
  );

DROP POLICY IF EXISTS "Shop staff can read shop orders" ON public.orders;
CREATE POLICY "Shop staff can read shop orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = orders.shop_id
    )
  );

DROP POLICY IF EXISTS "Shop staff can mark orders delivered" ON public.orders;
CREATE POLICY "Shop staff can mark orders delivered" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    status = 'PAID'
    AND EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = orders.shop_id
    )
  )
  WITH CHECK (
    status = 'DELIVERED'
    AND EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.user_id = auth.uid()
        AND pr.shop_id = orders.shop_id
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: recriar políticas (nomes antigos + variantes criadas manualmente)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Shop owner can read profiles of ordering clients" ON public.profiles;
DROP POLICY IF EXISTS "Shop owner can read profiles of appointment clients" ON public.profiles;
DROP POLICY IF EXISTS "Shop staff can read profiles of appointment clients" ON public.profiles;
DROP POLICY IF EXISTS "Shop staff can read profiles of ordering clients" ON public.profiles;
DROP POLICY IF EXISTS "user can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "user can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "user can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Shop owner can read profiles of ordering clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      INNER JOIN public.shops s ON s.id = o.shop_id AND s.owner_id = auth.uid()
      WHERE o.client_id = profiles.id
    )
  );

CREATE POLICY "Shop owner can read profiles of appointment clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      INNER JOIN public.shops s ON s.id = a.shop_id AND s.owner_id = auth.uid()
      WHERE a.client_id = profiles.id
    )
  );

CREATE POLICY "Shop staff can read profiles of ordering clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      INNER JOIN public.professionals pr ON pr.shop_id = o.shop_id AND pr.user_id = auth.uid()
      WHERE o.client_id = profiles.id
    )
  );

CREATE POLICY "Shop staff can read profiles of appointment clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      INNER JOIN public.professionals pr
        ON pr.id = a.professional_id
        AND pr.shop_id = a.shop_id
        AND pr.user_id = auth.uid()
      WHERE a.client_id = profiles.id
    )
  );

-- Função não é mais usada pelas policies; evita confusão e chamadas acidentais.
DROP FUNCTION IF EXISTS public.auth_professional_context();
