-- =============================================================================
-- ⚠️  Bootstrap MÍNIMO legado — NÃO use em banco que já tem `public.shops`
-- =============================================================================
--
-- Projeto real: use SEMPRE
--   supabase/migrations/*.sql  +  npm run db push
--
-- Este script só serve para spike / banco vazio SEM migrations (README Opção A).
-- Se `public.shops` já existir, o bloco abaixo ABORTA com mensagem clara.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.shops') IS NOT NULL THEN
    RAISE EXCEPTION
      'Tabela public.shops já existe. Não rode RUN_IN_SQL_EDITOR.sql — use migrations: npm run db:push (ver supabase/README.md).';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('BARBER', 'SALON', 'MANICURE')),
  description TEXT,
  address TEXT,
  profile_image TEXT,
  banner_image TEXT,
  primary_color TEXT DEFAULT '#1a1a1a',
  theme TEXT DEFAULT 'MODERN',
  subscription_active BOOLEAN DEFAULT TRUE,
  subscription_amount DECIMAL(10,2) DEFAULT 99.00,
  rating DECIMAL(3,2) DEFAULT 5.0,
  asaas_account_id TEXT,
  asaas_wallet_id TEXT,
  asaas_api_key TEXT,
  cnpj_cpf TEXT,
  email TEXT,
  phone TEXT,
  pix_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES public.shops(id),
  service_id UUID REFERENCES public.services(id),
  professional_id UUID REFERENCES public.professionals(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'COMPLETED', 'CANCELLED')),
  amount DECIMAL(10,2) NOT NULL,
  asaas_payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public shops are viewable by everyone" ON public.shops;
CREATE POLICY "Public shops are viewable by everyone" ON public.shops FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update their own shop" ON public.shops;
CREATE POLICY "Users can update their own shop" ON public.shops FOR UPDATE USING (auth.uid() = owner_id);
