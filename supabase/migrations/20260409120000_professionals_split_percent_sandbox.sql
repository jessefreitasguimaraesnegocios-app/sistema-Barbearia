-- Split por profissional em sandbox (runtime Asaas sandbox).
-- NULL em split_percent_sandbox → em pagamentos usa split_percent, depois fallback da loja.

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS split_percent_sandbox DECIMAL(5,2);

COMMENT ON COLUMN professionals.split_percent_sandbox IS
  'Split (0-100) em sandbox; NULL = usar split_percent do profissional / loja.';

UPDATE professionals
SET split_percent_sandbox = COALESCE(split_percent, 95.00)
WHERE split_percent_sandbox IS NULL;
