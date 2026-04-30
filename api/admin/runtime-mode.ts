import { createClient } from '@supabase/supabase-js';

type RuntimeMode = 'production' | 'sandbox';

function supabaseEnv() {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SUPABASE_URL = rawUrl.replace(/\/$/, '');
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY };
}

async function getAdminUserIdFromRequest(
  req: { headers?: Record<string, string | string[] | undefined> },
  env: ReturnType<typeof supabaseEnv>,
): Promise<{ userId: string } | { error: string; status: number }> {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Configuração do Supabase indisponível.', status: 500 };
  }
  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { error: 'Token de autorização não enviado. Faça login novamente.', status: 401 };
  }
  let authRes: Response;
  try {
    authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/runtime-mode] auth fetch', e);
    return { error: `Falha de rede ao validar sessão: ${msg}`, status: 503 };
  }
  if (!authRes.ok) {
    return { error: 'Sessão inválida ou expirada. Faça login novamente.', status: 401 };
  }
  const userData = (await authRes.json()) as { id?: string };
  const userId = userData?.id;
  if (!userId) return { error: 'Token inválido.', status: 401 };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile, error: profileErr } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (profileErr) {
    console.error('[api/admin/runtime-mode] profiles', profileErr);
    return { error: profileErr.message || 'Erro ao ler perfil.', status: 500 };
  }
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
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void } },
) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET' && req.method !== 'PATCH') {
      return res.status(405).json({ success: false, error: 'Método não permitido. Use GET ou PATCH.' });
    }

    const env = supabaseEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        success: false,
        error:
          'Configuração do Supabase indisponível no servidor. Defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env / .env.local ou nas variáveis do Vercel.',
      });
    }

    const admin = await getAdminUserIdFromRequest(req, env);
    if ('error' in admin) return res.status(admin.status).json({ success: false, error: admin.error });

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('platform_runtime_settings')
        .select('asaas_mode, updated_at, updated_by')
        .eq('singleton_id', true)
        .maybeSingle();
      if (error) {
        console.error('[api/admin/runtime-mode] GET platform_runtime_settings', error);
        return res.status(500).json({
          success: false,
          error: error.message,
          hint:
            'Confira se a migration `20260408180000_payment_runtime_mode_toggle` foi aplicada ao projeto (tabela platform_runtime_settings).',
        });
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
      .upsert({ singleton_id: true, asaas_mode: mode, updated_by: admin.userId }, { onConflict: 'singleton_id' })
      .select('asaas_mode, updated_at, updated_by')
      .single();

    if (error) {
      console.error('[api/admin/runtime-mode] PATCH platform_runtime_settings', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      mode: (data?.asaas_mode === 'sandbox' ? 'sandbox' : 'production') as RuntimeMode,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/runtime-mode] unhandled', e);
    return res.status(500).json({ success: false, error: message || 'Erro interno.' });
  }
}
