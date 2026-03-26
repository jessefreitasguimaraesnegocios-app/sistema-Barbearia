-- =============================================================================
-- Agenda do parceiro: colunas em `shops` + política de leitura de perfil
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run
-- (Corrige erro: "Could not find the 'agenda_slot_minutes' column of 'shops'")
-- =============================================================================

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS workday_start TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS workday_end TIME DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS lunch_start TIME,
  ADD COLUMN IF NOT EXISTS lunch_end TIME,
  ADD COLUMN IF NOT EXISTS agenda_slot_minutes INTEGER DEFAULT 30;

DROP POLICY IF EXISTS "Shop owner can read profiles of appointment clients" ON public.profiles;
CREATE POLICY "Shop owner can read profiles of appointment clients" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      INNER JOIN public.shops s ON s.id = a.shop_id AND s.owner_id = auth.uid()
      WHERE a.client_id = profiles.id
    )
  );
