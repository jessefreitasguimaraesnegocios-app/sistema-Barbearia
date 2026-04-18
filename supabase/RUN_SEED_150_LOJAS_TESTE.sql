-- =============================================================================
-- Seed de carga: 150 estabelecimentos (50 BARBER, 50 SALON, 50 MANICURE)
-- Cada loja com: todos serviços padrão do tipo + 2 funcionários
-- Wallet/Split sandbox fixos conforme solicitado
-- =============================================================================

BEGIN;

-- Prefixo para identificar e remover facilmente este seed
-- Use o mesmo valor no script RUN_DELETE_SEED_150_LOJAS_TESTE.sql
DO $$
DECLARE
  v_seed_prefix CONSTANT text := 'SEED_BULK_20260417';
BEGIN
  -- Limpa seed anterior com mesmo prefixo (idempotência)
  DELETE FROM public.shops
  WHERE name LIKE v_seed_prefix || ' %';
END $$;

CREATE TEMP TABLE _seed_source (
  shop_type text NOT NULL,
  idx int NOT NULL,
  name text NOT NULL,
  description text,
  address text
) ON COMMIT DROP;

INSERT INTO _seed_source (shop_type, idx, name, description, address)
SELECT
  'BARBER',
  gs,
  format('SEED_BULK_20260417 BARBER %s', lpad(gs::text, 2, '0')),
  format('Barbearia de teste %s', gs),
  format('Rua Teste Barber %s, Centro', gs)
FROM generate_series(1, 50) AS gs
UNION ALL
SELECT
  'SALON',
  gs,
  format('SEED_BULK_20260417 SALON %s', lpad(gs::text, 2, '0')),
  format('Salão de teste %s', gs),
  format('Rua Teste Salon %s, Centro', gs)
FROM generate_series(1, 50) AS gs
UNION ALL
SELECT
  'MANICURE',
  gs,
  format('SEED_BULK_20260417 MANICURE %s', lpad(gs::text, 2, '0')),
  format('Estúdio de manicure de teste %s', gs),
  format('Rua Teste Manicure %s, Centro', gs)
FROM generate_series(1, 50) AS gs;

CREATE TEMP TABLE _seed_shops (
  shop_id uuid PRIMARY KEY,
  shop_type text NOT NULL,
  idx int NOT NULL,
  name text NOT NULL
) ON COMMIT DROP;

WITH owner AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1
),
ins AS (
  INSERT INTO public.shops (
    owner_id,
    name,
    type,
    description,
    address,
    profile_image,
    banner_image,
    primary_color,
    theme,
    subscription_active,
    subscription_amount,
    rating,
    email,
    phone,
    pix_key,
    asaas_wallet_id_sandbox,
    split_percent,
    split_percent_sandbox,
    pass_fees_to_customer,
    workday_start,
    workday_end,
    lunch_start,
    lunch_end,
    agenda_slot_minutes
  )
  SELECT
    (SELECT id FROM owner),
    s.name,
    s.shop_type,
    s.description,
    s.address,
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1600',
    '#1a1a1a',
    'MODERN',
    true,
    99.00,
    4.9,
    format('seed.%s.%s@example.com', lower(s.shop_type), s.idx),
    format('3199%04s', s.idx::text),
    format('seed-pix-%s-%s', lower(s.shop_type), s.idx),
    'a21aa883-9a6f-4e9a-962a-98a36bf74a23',
    95.00,
    95.00,
    false,
    '08:00'::time,
    '20:00'::time,
    null,
    null,
    30
  FROM _seed_source s
  RETURNING id, name, type
)
INSERT INTO _seed_shops (shop_id, shop_type, idx, name)
SELECT i.id, src.shop_type, src.idx, i.name
FROM ins i
JOIN _seed_source src ON src.name = i.name;

-- 2 profissionais por loja
INSERT INTO public.professionals (
  shop_id,
  name,
  specialty,
  avatar,
  phone,
  cpf_cnpj,
  birth_date,
  asaas_wallet_id_sandbox,
  split_percent,
  split_percent_sandbox
)
SELECT
  ss.shop_id,
  format('Funcionário %s-%s', ss.idx, p.n),
  CASE
    WHEN ss.shop_type = 'BARBER' THEN CASE WHEN p.n = 1 THEN 'Barbeiro' ELSE 'Barbeiro Sênior' END
    WHEN ss.shop_type = 'SALON' THEN CASE WHEN p.n = 1 THEN 'Cabeleireiro(a)' ELSE 'Colorista' END
    ELSE CASE WHEN p.n = 1 THEN 'Manicure' ELSE 'Nail Designer' END
  END,
  format('https://ui-avatars.com/api/?name=%s-%s&background=random', ss.shop_type, p.n),
  format('3198%04s', (ss.idx * 10 + p.n)::text),
  lpad((10000000000 + ss.idx * 10 + p.n)::text, 11, '0'),
  (date '1990-01-01' + ((ss.idx + p.n) % 9000)),
  'a21aa883-9a6f-4e9a-962a-98a36bf74a23',
  95.00,
  95.00
FROM _seed_shops ss
CROSS JOIN (VALUES (1), (2)) AS p(n);

-- Serviços padrão de cada tipo
WITH service_templates AS (
  -- BARBER (14)
  SELECT 'BARBER'::text AS shop_type, 'Corte'::text AS name, null::text AS description, 35.00::numeric AS price, 30::int AS duration UNION ALL
  SELECT 'BARBER', 'Corte+barba', null, 55.00, 45 UNION ALL
  SELECT 'BARBER', 'Corte+barba+sombrancelha', null, 70.00, 60 UNION ALL
  SELECT 'BARBER', 'Barba completa', null, 30.00, 30 UNION ALL
  SELECT 'BARBER', 'Barba+pezinho', null, 38.00, 30 UNION ALL
  SELECT 'BARBER', 'Barba+sombrancelha', null, 42.00, 35 UNION ALL
  SELECT 'BARBER', 'Barba+sombrancelha+pezinho', null, 48.00, 40 UNION ALL
  SELECT 'BARBER', 'Pezinho', null, 20.00, 20 UNION ALL
  SELECT 'BARBER', 'Pezinho+sombrancelha', null, 28.00, 25 UNION ALL
  SELECT 'BARBER', 'Pintura', null, 60.00, 60 UNION ALL
  SELECT 'BARBER', 'Pintura+corte', null, 85.00, 75 UNION ALL
  SELECT 'BARBER', 'Pintura+barba', null, 88.00, 80 UNION ALL
  SELECT 'BARBER', 'Pintura+barba+pezinho', null, 95.00, 90 UNION ALL
  SELECT 'BARBER', 'Pintura+barba+corte', null, 110.00, 100 UNION ALL

  -- SALON (10)
  SELECT 'SALON', 'Corte feminino', 'Corte personalizado (curto, médio, longo, franja).', 70.00, 60 UNION ALL
  SELECT 'SALON', 'Coloração (tintura)', 'Mudança de cor completa ou retoque de raiz.', 160.00, 120 UNION ALL
  SELECT 'SALON', 'Luzes / mechas / loiro', 'Morena iluminada, balayage, platinado.', 220.00, 150 UNION ALL
  SELECT 'SALON', 'Escova (modelagem)', 'Escova lisa, ondulada, volumosa.', 55.00, 45 UNION ALL
  SELECT 'SALON', 'Tratamentos capilares', 'Hidratação, nutrição, reconstrução.', 90.00, 60 UNION ALL
  SELECT 'SALON', 'Progressiva / alisamento', 'Redução de volume e alisamento químico.', 250.00, 180 UNION ALL
  SELECT 'SALON', 'Penteados', 'Casamento, formatura, eventos.', 180.00, 120 UNION ALL
  SELECT 'SALON', 'Manicure e pedicure', 'Esmaltação comum e em gel.', 65.00, 60 UNION ALL
  SELECT 'SALON', 'Design de sobrancelhas', 'Limpeza, henna, modelagem.', 45.00, 30 UNION ALL
  SELECT 'SALON', 'Maquiagem profissional', 'Social, festa, noiva.', 140.00, 90 UNION ALL

  -- MANICURE (10)
  SELECT 'MANICURE', 'Manicure tradicional', 'Corte de cutículas, limpeza e esmaltação comum.', 40.00, 45 UNION ALL
  SELECT 'MANICURE', 'Manicure em gel', 'Esmaltação em gel com maior durabilidade e brilho.', 65.00, 60 UNION ALL
  SELECT 'MANICURE', 'Alongamento de unhas', 'Fibra, gel ou acrílico conforme técnica do espaço.', 150.00, 120 UNION ALL
  SELECT 'MANICURE', 'Manutenção de alongamento', 'Preenchimento, reforço e alinhamento das unhas.', 110.00, 90 UNION ALL
  SELECT 'MANICURE', 'Pedicure tradicional', 'Limpeza, hidratação dos pés e esmaltação.', 50.00, 50 UNION ALL
  SELECT 'MANICURE', 'Pedicure spa', 'Tratamento completo com esfoliação, massagem e cuidado intensivo.', 80.00, 70 UNION ALL
  SELECT 'MANICURE', 'Nail art / decoração', 'Desenhos, pedrarias, degradê e personalização.', 55.00, 45 UNION ALL
  SELECT 'MANICURE', 'Francesinha / baby boomer', 'Acabamento clássico ou em degradê suave.', 60.00, 50 UNION ALL
  SELECT 'MANICURE', 'Remoção de gel', 'Remoção segura de esmaltação em gel ou alongamento.', 35.00, 30 UNION ALL
  SELECT 'MANICURE', 'Spa das mãos', 'Hidratação profunda, parafina ou máscaras revitalizantes.', 70.00, 60
)
INSERT INTO public.services (shop_id, name, description, price, duration, desired_net_receipt)
SELECT
  ss.shop_id,
  t.name,
  t.description,
  t.price,
  t.duration,
  null
FROM _seed_shops ss
JOIN service_templates t ON t.shop_type = ss.shop_type;

-- Garantia final: wallet/split sandbox fixos para tudo do seed
UPDATE public.shops
SET
  asaas_wallet_id_sandbox = 'a21aa883-9a6f-4e9a-962a-98a36bf74a23',
  split_percent_sandbox = 95.00
WHERE name LIKE 'SEED_BULK_20260417 %';

UPDATE public.professionals p
SET
  asaas_wallet_id_sandbox = 'a21aa883-9a6f-4e9a-962a-98a36bf74a23',
  split_percent_sandbox = 95.00
FROM public.shops s
WHERE s.id = p.shop_id
  AND s.name LIKE 'SEED_BULK_20260417 %';

-- Resumo do seed
SELECT
  (SELECT count(*) FROM public.shops WHERE name LIKE 'SEED_BULK_20260417 %') AS shops_seed,
  (SELECT count(*) FROM public.professionals p JOIN public.shops s ON s.id = p.shop_id WHERE s.name LIKE 'SEED_BULK_20260417 %') AS professionals_seed,
  (SELECT count(*) FROM public.services sv JOIN public.shops s ON s.id = sv.shop_id WHERE s.name LIKE 'SEED_BULK_20260417 %') AS services_seed;

COMMIT;
