-- Valor líquido que o parceiro quer receber (modo "repassar taxas"); evita exibir reverso aproximado (ex. 100,01) após salvar.
ALTER TABLE services ADD COLUMN IF NOT EXISTS desired_net_receipt DECIMAL(12, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS desired_net_receipt DECIMAL(12, 2);

COMMENT ON COLUMN services.desired_net_receipt IS 'Quando pass_fees_to_customer: valor líquido desejado pelo parceiro (R$). NULL = legado ou preço fixo.';
COMMENT ON COLUMN products.desired_net_receipt IS 'Quando pass_fees_to_customer: valor líquido desejado pelo parceiro (R$). NULL = legado ou preço fixo.';
