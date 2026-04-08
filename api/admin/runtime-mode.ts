import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

type RuntimeMode = 'production' | 'sandbox';

async function getAdminUserIdFromRequest(
  req: { headers?: Record<string, string | string[] | undefined> }
): Promise<{ userId: string } | { error: string; status: number }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Configuração do Supabase indisponível.', status: 500 };
  }
  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { error: 'Token de autorização não enviado. Faça login novamente.', status: 401 };
  }
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!authRes.ok) {
    return { error: 'Sessão inválida ou expirada. Faça login novamente.', status: 401 };
  }
  const userData = (await authRes.json()) as { id?: string };
  const userId = userData?.id;
  if (!userId) return { error: 'Token inválido.', status: 401 };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'admin') {
    return { error: 'Apenas administradores podem alterar o ambiente de pagamento.', status: 403 };
  }
  return { userId };
}

export default async function handler(
  req: {
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: { mode?: RuntimeMode; confirmationText?: string };
  },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void } }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use GET ou PATCH.' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }

  const admin = await getAdminUserIdFromRequest(req);
  if ('error' in admin) return res.status(admin.status).json({ success: false, error: admin.error });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('platform_runtime_settings')
      .select('asaas_mode, updated_at, updated_by')
      .eq('singleton_id', true)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    const mode = (data?.asaas_mode === 'sandbox' ? 'sandbox' : 'production') as RuntimeMode;
    return res.status(200).json({
      success: true,
      mode,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
    });
  }

  const body = req.body || {};
  const mode = body.mode;
  if (mode !== 'production' && mode !== 'sandbox') {
    return res.status(400).json({ success: false, error: 'mode inválido. Use production ou sandbox.' });
  }
  if ((body.confirmationText || '').trim() !== 'CONFIRMAR') {
    return res.status(400).json({ success: false, error: 'Confirmação inválida. Digite CONFIRMAR.' });
  }

  const { data, error } = await supabase
    .from('platform_runtime_settings')
    .upsert(
      { singleton_id: true, asaas_mode: mode, updated_by: admin.userId },
      { onConflict: 'singleton_id' }
    )
    .select('asaas_mode, updated_at, updated_by')
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    mode: (data?.asaas_mode === 'sandbox' ? 'sandbox' : 'production') as RuntimeMode,
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  });
}
