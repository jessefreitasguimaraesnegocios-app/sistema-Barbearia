-- Plano Mercado Pago (preapproval_plan_id) por loja — link de checkout da mensalidade da plataforma.
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS mp_preapproval_plan_id text;

COMMENT ON COLUMN public.shops.mp_preapproval_plan_id IS
  'Mercado Pago preapproval_plan_id usado no checkout da mensalidade da plataforma (definido pelo admin na criação/edição da loja).';
