-- Terceiro tipo de estabelecimento: estúdio / espaço de manicure
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_type_check;

ALTER TABLE shops
  ADD CONSTRAINT shops_type_check CHECK (type IN ('BARBER', 'SALON', 'MANICURE'));
