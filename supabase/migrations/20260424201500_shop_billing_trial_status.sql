-- Trial + status de cobrança por estabelecimento (mensalidade customizada)
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_blocked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_trial_days_allowed'
      AND conrelid = 'public.shops'::regclass
  ) THEN
    ALTER TABLE public.shops
      ADD CONSTRAINT shops_trial_days_allowed
      CHECK (trial_days IN (15, 30));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shops_billing_status_allowed'
      AND conrelid = 'public.shops'::regclass
  ) THEN
    ALTER TABLE public.shops
      ADD CONSTRAINT shops_billing_status_allowed
      CHECK (billing_status IN ('trialing', 'active', 'past_due', 'blocked', 'canceled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shops_trial_ends_at ON shops (trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_shops_billing_status ON shops (billing_status);

-- Backfill para lojas legadas: mantém comportamento atual como "active"
UPDATE shops
SET billing_status = CASE WHEN subscription_active THEN 'active' ELSE 'blocked' END
WHERE billing_status IS NULL
   OR billing_status NOT IN ('trialing', 'active', 'past_due', 'blocked', 'canceled');
