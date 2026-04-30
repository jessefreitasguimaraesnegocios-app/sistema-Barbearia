// Vercel Serverless: POST /api/admin/process-shop-finance
// Admin autenticado dispara a Edge Function process-shop-finance (provisionamento Asaas assíncrono).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(
  req: {
    method?: string;
    headers?: { authorization?: string };
    body?: { shopId?: string; limit?: number };
  },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void; end: () => void };
    end?: (code?: number) => void;
  }
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
    return res.status(401).json({ success: false, error: 'Token de autorização não enviado.' });
  }

  if (SUPABASE_ANON_KEY) {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!authRes.ok) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
    }
    const userData = (await authRes.json()) as { id?: string };
    if (!userData?.id) {
      return res.status(401).json({ success: false, error: 'Token inválido.' });
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', userData.id).single();
    if ((profile as { role?: string } | null)?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores.' });
    }
  }

  const body = req.body || {};
  const shopId = body.shopId != null ? String(body.shopId).trim() : '';
  const limit = body.limit != null ? Math.min(20, Math.max(1, Number(body.limit))) : undefined;

  const functionUrl = `${SUPABASE_URL}/functions/v1/process-shop-finance`;
  const fnRes = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      ...(shopId ? { shopId } : {}),
      ...(limit != null ? { limit } : {}),
    }),
  });

  const text = await fnRes.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return res.status(502).json({ success: false, error: 'Resposta inválida da função.', details: text });
  }

  return res.status(fnRes.ok ? 200 : fnRes.status >= 400 ? fnRes.status : 502).json(data);
}
