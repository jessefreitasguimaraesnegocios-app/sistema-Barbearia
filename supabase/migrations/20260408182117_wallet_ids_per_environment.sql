-- Wallet IDs segregated by runtime environment.
-- This keeps split routing stable when toggling production/sandbox.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_prod TEXT,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_sandbox TEXT;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_prod TEXT,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id_sandbox TEXT;

-- Backfill current legacy values as production defaults.
UPDATE public.shops
SET asaas_wallet_id_prod = asaas_wallet_id
WHERE (asaas_wallet_id_prod IS NULL OR btrim(asaas_wallet_id_prod) = '')
  AND asaas_wallet_id IS NOT NULL
  AND btrim(asaas_wallet_id) <> '';

-- Professionals already store `asaas_environment`.
UPDATE public.professionals
SET asaas_wallet_id_prod = asaas_wallet_id
WHERE (asaas_wallet_id_prod IS NULL OR btrim(asaas_wallet_id_prod) = '')
  AND asaas_wallet_id IS NOT NULL
  AND btrim(asaas_wallet_id) <> ''
  AND COALESCE(asaas_environment, 'production') <> 'sandbox';

UPDATE public.professionals
SET asaas_wallet_id_sandbox = asaas_wallet_id
WHERE (asaas_wallet_id_sandbox IS NULL OR btrim(asaas_wallet_id_sandbox) = '')
  AND asaas_wallet_id IS NOT NULL
  AND btrim(asaas_wallet_id) <> ''
  AND asaas_environment = 'sandbox';
