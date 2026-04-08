-- Split específico quando o runtime Asaas está em sandbox (platform_runtime_settings.asaas_mode = sandbox).
-- Se NULL, create-payment / API usam split_percent (produção).

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS split_percent_sandbox DECIMAL(5,2);

COMMENT ON COLUMN shops.split_percent_sandbox IS
  'Percentual (0-100) do split Asaas em sandbox; NULL = usar split_percent.';

UPDATE shops
SET split_percent_sandbox = COALESCE(split_percent, 95.00)
WHERE split_percent_sandbox IS NULL;
