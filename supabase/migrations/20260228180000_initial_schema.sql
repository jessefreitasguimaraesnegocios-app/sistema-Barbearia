-- Supabase Database Structure for Barber & Beauty Hub (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Shops Table
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('BARBER', 'SALON')),
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

-- 2. Services Table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Professionals Table
CREATE TABLE IF NOT EXISTS professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id),
  service_id UUID REFERENCES services(id),
  professional_id UUID REFERENCES professionals(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'COMPLETED', 'CANCELLED')),
  amount DECIMAL(10,2) NOT NULL,
  asaas_payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (idempotent: drop if exists then create)
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public shops are viewable by everyone" ON shops;
CREATE POLICY "Public shops are viewable by everyone" ON shops FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update their own shop" ON shops;
CREATE POLICY "Users can update their own shop" ON shops FOR UPDATE USING (auth.uid() = owner_id);
