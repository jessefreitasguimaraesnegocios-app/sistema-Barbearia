-- Supabase Database Structure for Barber & Beauty Hub

-- 1. Shops Table
CREATE TABLE shops (
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
  rating DECIMAL(3,2) DEFAULT 5.0,
  
  -- Asaas Integration Fields
  asaas_account_id TEXT, -- The ID of the sub-account in Asaas
  asaas_wallet_id TEXT,  -- The Wallet ID for splits
  asaas_api_key TEXT,    -- The API Key for the sub-account (encrypted in production!)
  
  -- Registration Info
  cnpj_cpf TEXT,
  email TEXT,
  phone TEXT,
  pix_key TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Services Table
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER NOT NULL, -- in minutes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Professionals Table
CREATE TABLE professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Appointments Table
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id),
  service_id UUID REFERENCES services(id),
  professional_id UUID REFERENCES professionals(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'COMPLETED', 'CANCELLED')),
  amount DECIMAL(10,2) NOT NULL,
  asaas_payment_id TEXT, -- ID of the payment in Asaas
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Example)
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public shops are viewable by everyone" ON shops FOR SELECT USING (true);
CREATE POLICY "Users can update their own shop" ON shops FOR UPDATE USING (auth.uid() = owner_id);
