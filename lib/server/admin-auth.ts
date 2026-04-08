import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AdminAuthResult =
  | { success: true; supabase: SupabaseClient; userId: string }
  | { success: false; status: number; error: string };

/**
 * Valida JWT do usuário e perfil admin (mesmo padrão de subscription / process-shop-finance).
 */
export async function assertAdminFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
}): Promise<AdminAuthResult> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { success: false as const, status: 500, error: 'Configuração do Supabase indisponível.' };
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { success: false as const, status: 401, error: 'Token de autorização não enviado. Faça login novamente.' };
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!authRes.ok) {
    return { success: false as const, status: 401, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }

  let userData: { id?: string };
  try {
    userData = (await authRes.json()) as { id?: string };
  } catch {
    return { success: false as const, status: 502, error: 'Resposta inválida do serviço de autenticação.' };
  }
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
