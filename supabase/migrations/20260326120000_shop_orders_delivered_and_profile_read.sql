-- Parceiro: marcar pedido como entregue (somente PAID → DELIVERED)
DROP POLICY IF EXISTS "Shop owner can mark orders delivered" ON orders;
CREATE POLICY "Shop owner can mark orders delivered" ON orders
  FOR UPDATE
  TO authenticated
  USING (
    status = 'PAID'
    AND EXISTS (
      SELECT 1 FROM shops s
      WHERE s.id = orders.shop_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'DELIVERED'
    AND EXISTS (
      SELECT 1 FROM shops s
      WHERE s.id = orders.shop_id AND s.owner_id = auth.uid()
    )
  );

-- Parceiro: ler nome/foto de clientes que já fizeram pedido na loja (para tela de retirada)
DROP POLICY IF EXISTS "Shop owner can read profiles of ordering clients" ON profiles;
CREATE POLICY "Shop owner can read profiles of ordering clients" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      INNER JOIN shops s ON s.id = o.shop_id AND s.owner_id = auth.uid()
      WHERE o.client_id = profiles.id
    )
  );
