-- Permite ao parceiro repassar taxas (plataforma + Asaas) para o preço dos serviços
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pass_fees_to_customer BOOLEAN DEFAULT false;
COMMENT ON COLUMN shops.pass_fees_to_customer IS 'Se true, o parceiro informa o valor que quer receber e o app calcula o preço mínimo a cobrar (incluindo taxa plataforma + 1,99 Asaas), arredondado para cima em R$ 0,50.';
