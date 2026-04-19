-- Permite expirar pedidos PIX não pagos (job expire-pending-pix).

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN ('PENDING', 'PAID', 'DELIVERED', 'CANCELLED')
  );

COMMENT ON CONSTRAINT orders_status_check ON public.orders IS
  'CANCELLED: PIX não confirmado no prazo ou cancelamento manual.';
