// Vercel Serverless: DELETE /api/admin/shops/:id
// Exclui a loja (e em cascata: services, professionals, products, appointments). Perfis do dono ficam com shop_id null.

import { assertAdminFromRequest } from '../../../lib/server/admin-auth';

function getShopIdFromRequest(req: { url?: string; query?: { id?: string } }): string | null {
  const fromQuery = req.query?.id;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  const rawUrl = req.url || '';
  const pathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.split('?')[0];
  const match = pathname.match(/\/api\/admin\/shops\/([^/]+)/);
  return match ? match[1].trim() : null;
}

export default async function handler(
  req: { method?: string; url?: string; query?: { id?: string }; headers?: Record<string, string | string[] | undefined> },
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

  const shopId = getShopIdFromRequest(req);
  if (!shopId) {
    return res.status(400).json({ success: false, error: 'ID da loja não encontrado na URL.' });
  }

  const auth = await assertAdminFromRequest(req);
  if (auth.success === false) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  try {
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
