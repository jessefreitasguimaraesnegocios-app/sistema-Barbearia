import { createClient } from '@supabase/supabase-js';

/**
 * Valida JWT do usuário e perfil admin.
 * Retorna client com service role para operações de backend.
 */
export async function assertAdminFromRequest(req) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { success: false, status: 500, error: 'Configuração do Supabase indisponível.' };
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { success: false, status: 401, error: 'Token de autorização não enviado. Faça login novamente.' };
  }

  let authRes;
  try {
    authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
  } catch (e) {
    console.error('[admin-auth] auth fetch failed', e);
    return {
      success: false,
      status: 502,
      error: 'Não foi possível validar a sessão (rede). Tente de novo.',
    };
  }

  if (!authRes.ok) {
    return { success: false, status: 401, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }

  let userData;
  try {
    userData = await authRes.json();
  } catch {
    return { success: false, status: 502, error: 'Resposta inválida do serviço de autenticação.' };
  }

  const userId = userData?.id;
  if (!userId) {
    return { success: false, status: 401, error: 'Token inválido.' };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if ((profile?.role || null) !== 'admin') {
    return { success: false, status: 403, error: 'Apenas administradores.' };
  }

  return { success: true, supabase, userId };
}
