-- Preço dos serviços na vitrine/agenda para profissionais “júnior” (percentual da tabela).
-- NULL = cobrança pelo preço integral do serviço.

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS junior_price_percent INTEGER;

ALTER TABLE professionals
  DROP CONSTRAINT IF EXISTS professionals_junior_price_percent_check;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_junior_price_percent_check CHECK (
    junior_price_percent IS NULL
    OR (junior_price_percent >= 50 AND junior_price_percent <= 90)
  );

COMMENT ON COLUMN professionals.junior_price_percent IS
  'Quando preenchido (50–90), o cliente paga esse % do preço de tabela do serviço com este profissional.';
