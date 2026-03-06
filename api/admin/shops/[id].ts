// Vercel Serverless: DELETE /api/admin/shops/:id
// Exclui a loja (e em cascata: services, professionals, products, appointments). Perfis do dono ficam com shop_id null.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getShopIdFromPath(url: string): string | null {
  const match = url?.match(/\/api\/admin\/shops\/([^/?]+)(?:\/|$)/);
  return match ? match[1] : null;
}

export default async function handler(
  req: { method?: string; url?: string; query?: { id?: string } },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use DELETE.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }

  const shopId = req.query?.id ?? getShopIdFromPath(req.url || '');
  if (!shopId) {
    return res.status(400).json({ success: false, error: 'ID da loja não encontrado na URL.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('shops').delete().eq('id', shopId);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, deleted: true });
  } catch (e) {
    console.error('[api/admin/shops/[id]]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao excluir loja.',
    });
  }
}
