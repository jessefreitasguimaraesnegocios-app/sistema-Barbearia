-- Tabela profiles: vincula auth.users a role e shop_id (dono da loja ou cliente)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'barbearia', 'cliente')),
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar por shop_id (dono da loja)
CREATE INDEX IF NOT EXISTS idx_profiles_shop_id ON profiles(shop_id);

-- RLS: usuário só lê o próprio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);

-- Inserção/atualização apenas via service role (Edge Functions / backend)
-- Nenhuma policy de INSERT/UPDATE para anon/authenticated = só service role pode escrever
