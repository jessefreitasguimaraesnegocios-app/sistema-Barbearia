// Vercel Serverless: DELETE /api/admin/shops/:id
// Exclui a loja (e em cascata: services, professionals, products, appointments). Perfis do dono ficam com shop_id null.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type AdminAuthResult =
  | { success: true; supabase: SupabaseClient; userId: string }
  | { success: false; status: number; error: string };

function parseFirstStringFromJsonMap(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const map = parsed as Record<string, unknown>;
    const preferredKeys = ['service_role', 'serviceRole', 'anon', 'publishable', 'default'];
    for (const key of preferredKeys) {
      const value = map[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    for (const value of Object.values(map)) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }
  return null;
}

async function assertAdminFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
}): Promise<AdminAuthResult> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SECRET_KEY ||
    parseFirstStringFromJsonMap(process.env.SUPABASE_SECRET_KEYS);
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    parseFirstStringFromJsonMap(process.env.SUPABASE_PUBLISHABLE_KEYS);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { success: false as const, status: 500, error: 'Configuração do Supabase indisponível.' };
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { success: false as const, status: 401, error: 'Token de autorização não enviado. Faça login novamente.' };
  }

  let authRes: Response;
  try {
    authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
  } catch {
    return { success: false as const, status: 502, error: 'Não foi possível validar a sessão (rede). Tente de novo.' };
  }
  if (!authRes.ok) {
    return { success: false as const, status: 401, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }
  const userData = (await authRes.json()) as { id?: string };
  const userId = userData?.id;
  if (!userId) {
    return { success: false as const, status: 401, error: 'Token inválido.' };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { success: false as const, status: 403, error: 'Apenas administradores.' };
  }

  return { success: true as const, supabase, userId };
}

function getShopIdFromRequest(req: { url?: string; query?: { id?: string | string[] } }): string | null {
  const fromQuery = req.query?.id;
  if (fromQuery != null) {
    const one = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
    if (one && String(one).trim()) return String(one).trim();
  }
  const rawUrl = req.url || '';
  let pathname: string;
  try {
    pathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.split('?')[0] || '';
  } catch {
    pathname = rawUrl.split('?')[0] || '';
  }
  const match = pathname.match(/\/api\/admin\/shops\/([^/]+)/);
  return match ? match[1].trim() : null;
}

export default async function handler(
  req: {
    method?: string;
    url?: string;
    query?: { id?: string | string[] };
    headers?: Record<string, string | string[] | undefined>;
  },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'DELETE') {
      return res.status(405).json({ success: false, error: 'Método não permitido. Use DELETE.' });
    }

    const shopId = getShopIdFromRequest(req);
    if (!shopId) {
      return res.status(400).json({ success: false, error: 'ID da loja não encontrado na URL.' });
    }

    const auth = await assertAdminFromRequest(req);
    if (auth.success === false) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    const supabase = auth.supabase;
    const { error } = await supabase.from('shops').delete().eq('id', shopId);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[api/admin/shops/[id]]', e);
    return res.status(500).json({
      success: false,
      error: message || 'Erro ao excluir loja.',
    });
  }
}
