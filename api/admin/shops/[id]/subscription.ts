// Vercel Serverless: PATCH /api/admin/shops/:id/subscription
// Atualiza subscription_active, subscription_amount e/ou split_percent da loja (service role)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getShopId(req: { query?: { id?: string }; url?: string }): string | null {
  if (req.query?.id) return req.query.id;
  const match = req.url?.match(/\/api\/admin\/shops\/([^/?]+)\/subscription/);
  return match ? match[1] : null;
}

export default async function handler(
  req: { method?: string; url?: string; query?: { id?: string }; body?: Record<string, unknown> },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use PATCH.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }

  const shopId = req.query?.id ?? getShopId(req);
  if (!shopId) {
    return res.status(400).json({ success: false, error: 'ID da loja não encontrado na URL.' });
  }

  const body = (req.body || {}) as {
    subscriptionActive?: boolean;
    subscriptionAmount?: number;
    splitPercent?: number;
    asaasApiKey?: string | null;
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.subscriptionActive === 'boolean') updates.subscription_active = body.subscriptionActive;
  if (typeof body.subscriptionAmount === 'number' && body.subscriptionAmount >= 0) updates.subscription_amount = body.subscriptionAmount;
  if (typeof body.splitPercent === 'number' && body.splitPercent >= 0 && body.splitPercent <= 100) updates.split_percent = body.splitPercent;
  if (body.asaasApiKey !== undefined) updates.asaas_api_key = body.asaasApiKey === '' || body.asaasApiKey === null ? null : String(body.asaasApiKey).trim();

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'Envie subscriptionActive, subscriptionAmount, splitPercent e/ou asaasApiKey.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: shop, error } = await supabase
      .from('shops')
      .update(updates)
      .eq('id', shopId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (!shop) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    return res.status(200).json({
      success: true,
      shop: {
        ...shop,
        ownerId: shop.owner_id,
        profileImage: shop.profile_image,
        bannerImage: shop.banner_image,
        subscriptionActive: shop.subscription_active,
        subscriptionAmount: shop.subscription_amount != null ? Number(shop.subscription_amount) : 99,
        splitPercent: shop.split_percent != null ? Number(shop.split_percent) : 95,
        asaasAccountId: shop.asaas_account_id,
        asaasWalletId: shop.asaas_wallet_id,
        asaasApiKeyConfigured: !!(shop as { asaas_api_key?: string }).asaas_api_key,
        cnpjOrCpf: shop.cnpj_cpf,
        pixKey: shop.pix_key,
        services: (shop as { services?: unknown[] }).services ?? [],
        professionals: (shop as { professionals?: unknown[] }).professionals ?? [],
        products: (shop as { products?: unknown[] }).products ?? [],
      },
    });
  } catch (e) {
    console.error('[api/admin/shops/[id]/subscription]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao atualizar loja.',
    });
  }
}
