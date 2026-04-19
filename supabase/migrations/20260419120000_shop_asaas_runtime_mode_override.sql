-- Optional per-shop Asaas environment (production | sandbox).
-- NULL = follow global `platform_runtime_settings.asaas_mode`.

ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS asaas_runtime_mode TEXT NULL
CHECK (asaas_runtime_mode IS NULL OR asaas_runtime_mode IN ('production', 'sandbox'));

COMMENT ON COLUMN public.shops.asaas_runtime_mode IS
  'When set, PIX/split and partner wallet calls for this shop use this Asaas environment instead of the platform default.';
