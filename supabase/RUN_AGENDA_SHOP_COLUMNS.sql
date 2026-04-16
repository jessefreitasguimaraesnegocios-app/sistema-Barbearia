-- =============================================================================
-- Agenda do parceiro: colunas em `shops` + policy de leitura de perfil
-- =============================================================================
--
-- FONTE CANÔNICA (já entra no `npm run db push`):
--   supabase/migrations/20260326200000_shop_agenda_hours_and_profile_appointments.sql
--
-- Este arquivo é uma cópia IDEMPOTENTE para o SQL Editor quando quiser
-- re-aplicar à mão (ex.: dúvida se o remoto está igual ao repo).
-- Seguro rodar várias vezes.
--
-- Dashboard → SQL Editor → colar → Run
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
