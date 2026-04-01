-- Evita recursão infinita em RLS em public.profiles: políticas que consultam profiles
-- (ex.: JOIN profiles staff) reavaliavam as mesmas políticas e geravam 500 no PostgREST.

CREATE OR REPLACE FUNCTION public.auth_professional_context()
RETURNS TABLE(shop_id uuid, professional_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.shop_id, p.professional_id
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.role = 'profissional';
$$;

REVOKE ALL ON FUNCTION public.auth_professional_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_professional_context() TO authenticated;

-- appointments: staff (sem subselect em profiles)
DROP POLICY IF EXISTS "Shop staff can read shop appointments" ON public.appointments;
CREATE POLICY "Shop staff can read shop appointments" ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.professional_id IS NOT NULL
        AND ctx.shop_id = appointments.shop_id
        AND ctx.professional_id = appointments.professional_id
    )
  );

DROP POLICY IF EXISTS "Shop staff can update shop appointments" ON public.appointments;
CREATE POLICY "Shop staff can update shop appointments" ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.professional_id IS NOT NULL
        AND ctx.shop_id = appointments.shop_id
        AND ctx.professional_id = appointments.professional_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.professional_id IS NOT NULL
        AND ctx.shop_id = appointments.shop_id
        AND ctx.professional_id = appointments.professional_id
    )
  );

-- orders: staff
DROP POLICY IF EXISTS "Shop staff can read shop orders" ON public.orders;
CREATE POLICY "Shop staff can read shop orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.shop_id = orders.shop_id
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
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.shop_id = orders.shop_id
    )
  )
  WITH CHECK (
    status = 'DELIVERED'
    AND EXISTS (
      SELECT 1
      FROM public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.shop_id = orders.shop_id
    )
  );

-- profiles: leitura de clientes pela equipe (sem JOIN em profiles)
DROP POLICY IF EXISTS "Shop staff can read profiles of appointment clients" ON public.profiles;
CREATE POLICY "Shop staff can read profiles of appointment clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a,
           public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.professional_id IS NOT NULL
        AND ctx.shop_id = a.shop_id
        AND ctx.professional_id = a.professional_id
        AND a.client_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "Shop staff can read profiles of ordering clients" ON public.profiles;
CREATE POLICY "Shop staff can read profiles of ordering clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o,
           public.auth_professional_context() ctx
      WHERE ctx.shop_id IS NOT NULL
        AND ctx.shop_id = o.shop_id
        AND o.client_id = profiles.id
    )
  );
