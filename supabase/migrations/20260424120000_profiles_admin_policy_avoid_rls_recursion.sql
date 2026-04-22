-- Evita recursão infinita em RLS: a policy anterior lia `profiles` dentro de uma policy em `profiles`,
-- o que impedia até o admin de ler a própria linha (login / fetchProfile travava ou falhava).

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admin can read shop-linked profiles" ON public.profiles;
CREATE POLICY "Admin can read shop-linked profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_admin()
    AND (
      EXISTS (
        SELECT 1
        FROM public.shops s
        WHERE s.owner_id = profiles.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.professionals pr
        WHERE pr.user_id = profiles.id
      )
    )
  );
