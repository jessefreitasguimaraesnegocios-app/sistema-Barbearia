-- Horário de funcionamento da loja (agenda do parceiro)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS workday_start TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS workday_end TIME DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS lunch_start TIME,
  ADD COLUMN IF NOT EXISTS lunch_end TIME,
  ADD COLUMN IF NOT EXISTS agenda_slot_minutes INT DEFAULT 30;

-- Parceiro: ler perfil de clientes com agendamento na loja (nome, telefone, WhatsApp)
DROP POLICY IF EXISTS "Shop owner can read profiles of appointment clients" ON profiles;
CREATE POLICY "Shop owner can read profiles of appointment clients" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      INNER JOIN shops s ON s.id = a.shop_id AND s.owner_id = auth.uid()
      WHERE a.client_id = profiles.id
    )
  );
