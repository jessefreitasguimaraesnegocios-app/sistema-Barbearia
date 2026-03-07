// Vercel Serverless: POST /api/admin/create-shop
// Proxy para a Edge Function create-shop usando service role (evita 401 por JWT no front)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(
  req: { method?: string; headers?: { authorization?: string }; body?: Record<string, unknown> },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }

  const authHeader = req.headers?.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de autorização não enviado. Faça login novamente.' });
  }

  try {
    if (SUPABASE_ANON_KEY) {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });
      if (!authRes.ok) {
        return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada. Faça login novamente.' });
      }
      const userData = (await authRes.json()) as { id?: string };
      const userId = userData?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Token inválido.' });
      }
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single();
      const role = (profile as { role?: string } | null)?.role;
      if (role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Apenas administradores podem cadastrar parceiros.' });
      }
    }

    const body = req.body || {};
    const functionUrl = `${SUPABASE_URL}/functions/v1/create-shop`;
    const functionRes = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await functionRes.text();
    let data: object;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ success: false, error: 'Resposta inválida da função.', details: text });
    }

    if (!functionRes.ok) {
      const err = data as { error?: string; details?: string };
      return res.status(functionRes.status >= 400 ? functionRes.status : 400).json({
        success: false,
        error: err?.error || 'Erro ao criar parceiro.',
        details: err?.details,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('[api/admin/create-shop]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao cadastrar parceiro.',
    });
  }
}
