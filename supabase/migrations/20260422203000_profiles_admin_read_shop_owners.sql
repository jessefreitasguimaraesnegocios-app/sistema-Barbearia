-- Admin: permitir ler perfis de donos/equipe ligados a lojas (contatos / suporte).
DROP POLICY IF EXISTS "Admin can read shop-linked profiles" ON public.profiles;
CREATE POLICY "Admin can read shop-linked profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'admin'
    )
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
