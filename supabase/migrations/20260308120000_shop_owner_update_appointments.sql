-- Dono da loja pode marcar agendamento como concluído (botão "Iniciar Atendimento")
DROP POLICY IF EXISTS "Shop owner can update shop appointments" ON appointments;
CREATE POLICY "Shop owner can update shop appointments" ON appointments
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = appointments.shop_id AND shops.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = appointments.shop_id AND shops.owner_id = auth.uid())
  );
