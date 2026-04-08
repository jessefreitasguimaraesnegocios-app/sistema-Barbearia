-- Global runtime mode for payment gateway environment (production | sandbox).
-- Single-row table consumed by admin toggle and payment/webhook runtimes.

CREATE TABLE IF NOT EXISTS public.platform_runtime_settings (
  singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id),
  asaas_mode TEXT NOT NULL DEFAULT 'production' CHECK (asaas_mode IN ('production', 'sandbox')),
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_platform_runtime_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_platform_runtime_settings_updated_at ON public.platform_runtime_settings;
CREATE TRIGGER trg_touch_platform_runtime_settings_updated_at
BEFORE UPDATE ON public.platform_runtime_settings
FOR EACH ROW
EXECUTE PROCEDURE public.touch_platform_runtime_settings_updated_at();

INSERT INTO public.platform_runtime_settings (singleton_id, asaas_mode)
VALUES (TRUE, 'production')
ON CONFLICT (singleton_id) DO NOTHING;
