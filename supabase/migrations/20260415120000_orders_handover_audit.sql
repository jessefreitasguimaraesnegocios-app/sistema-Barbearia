-- Registo de quem marcou retirada na loja (histórico do dia na UI do parceiro).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_over_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handed_over_by_label text,
  ADD COLUMN IF NOT EXISTS handed_over_items_snapshot jsonb;

COMMENT ON COLUMN public.orders.handed_over_at IS 'Momento em que o parceiro marcou o pedido como retirado.';
COMMENT ON COLUMN public.orders.handed_over_by_user_id IS 'auth.users que confirmou a retirada.';
COMMENT ON COLUMN public.orders.handed_over_by_label IS 'Nome exibido (dono ou profissional da equipe).';
COMMENT ON COLUMN public.orders.handed_over_items_snapshot IS 'JSON dos itens no momento da retirada (resumo estável).';

CREATE INDEX IF NOT EXISTS idx_orders_shop_handed_over_at ON public.orders (shop_id, handed_over_at DESC)
  WHERE handed_over_at IS NOT NULL;
