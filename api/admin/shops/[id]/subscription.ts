// Vercel Serverless: PATCH /api/admin/shops/:id/subscription
// Atualiza subscription_active, subscription_amount e/ou split_percent da loja (service role)

import { createClient } from '@supabase/supabase-js';
import { insertFinancialAudit } from '../../../../lib/server/financial-audit';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/** Colunas seguras (sem asaas_api_key). */
const SHOP_SELECT_SAFE =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, asaas_customer_id, cnpj_cpf, email, phone, pix_key, created_at, split_percent, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, finance_provision_status, finance_provision_last_error';

function getShopId(req: { query?: { id?: string }; url?: string }): string | null {
  if (req.query?.id) return req.query.id;
  const match = req.url?.match(/\/api\/admin\/shops\/([^/?]+)\/subscription/);
  return match ? match[1] : null;
}

function getClientMeta(req: { headers?: Record<string, string | string[] | undefined> }): { ip: string | null; userAgent: string | null } {
  const h = req.headers;
  if (!h) return { ip: null, userAgent: null };
  const xf = h['x-forwarded-for'];
  const first =
    typeof xf === 'string'
      ? xf.split(',')[0]?.trim() || null
      : Array.isArray(xf)
        ? xf[0]?.trim() || null
        : null;
  const real = h['x-real-ip'];
  const ip =
    first ||
    (typeof real === 'string' ? real : Array.isArray(real) ? real[0] : null) ||
    null;
  const ua = h['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : Array.isArray(ua) ? ua[0] : null;
  return { ip, userAgent };
}

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
    return { error: 'Apenas administradores podem alterar assinatura da loja.', status: 403 };
  }
  return { userId };
}

function mapShopResponse(shop: Record<string, unknown>) {
  return {
    id: shop.id as string,
    ownerId: shop.owner_id,
    name: shop.name,
    type: shop.type,
    description: shop.description ?? '',
    address: shop.address ?? '',
    profileImage: shop.profile_image,
    bannerImage: shop.banner_image,
    primaryColor: shop.primary_color || '#1a1a1a',
    theme: shop.theme || 'MODERN',
    subscriptionActive: shop.subscription_active,
    subscriptionAmount: shop.subscription_amount != null ? Number(shop.subscription_amount) : 99,
    rating: shop.rating != null ? Number(shop.rating) : 5,
    splitPercent: shop.split_percent != null ? Number(shop.split_percent) : 95,
    passFeesToCustomer: shop.pass_fees_to_customer === true,
    asaasAccountId: shop.asaas_account_id,
    asaasWalletId: shop.asaas_wallet_id,
    asaasCustomerId: shop.asaas_customer_id,
    asaasApiKeyConfigured: shop.asaas_api_key_configured === true,
    cnpjOrCpf: shop.cnpj_cpf,
    email: shop.email,
    phone: shop.phone,
    pixKey: shop.pix_key,
    workdayStart: shop.workday_start != null ? String(shop.workday_start).slice(0, 5) : undefined,
    workdayEnd: shop.workday_end != null ? String(shop.workday_end).slice(0, 5) : undefined,
    lunchStart: shop.lunch_start != null && String(shop.lunch_start).trim() !== '' ? String(shop.lunch_start).slice(0, 5) : undefined,
    lunchEnd: shop.lunch_end != null && String(shop.lunch_end).trim() !== '' ? String(shop.lunch_end).slice(0, 5) : undefined,
    agendaSlotMinutes:
      shop.agenda_slot_minutes != null && Number(shop.agenda_slot_minutes) > 0
        ? Number(shop.agenda_slot_minutes)
        : 30,
    financeProvisionStatus: shop.finance_provision_status as
      | 'pending'
      | 'processing'
      | 'awaiting_callback'
      | 'active'
      | 'failed'
      | undefined,
    financeProvisionLastError: shop.finance_provision_last_error != null ? String(shop.finance_provision_last_error) : undefined,
    services: [],
    professionals: [],
    products: [],
  };
}

export default async function handler(
  req: {
    method?: string;
    url?: string;
    query?: { id?: string };
    body?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
  },
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

  const admin = await getAdminUserIdFromRequest(req);
  if ('error' in admin) {
    return res.status(admin.status).json({ success: false, error: admin.error });
  }
  const clientMeta = getClientMeta(req);

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
  const keyUpdateRequested = body.asaasApiKey !== undefined;
  if (keyUpdateRequested) updates.asaas_api_key = body.asaasApiKey === '' || body.asaasApiKey === null ? null : String(body.asaasApiKey).trim();

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'Envie subscriptionActive, subscriptionAmount, splitPercent e/ou asaasApiKey.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: shop, error } = await supabase
      .from('shops')
      .update(updates)
      .eq('id', shopId)
      .select(SHOP_SELECT_SAFE)
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (!shop) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    if (keyUpdateRequested) {
      await insertFinancialAudit(supabase, {
        shop_id: shopId,
        actor_user_id: admin.userId,
        action: 'SHOP_API_KEY_UPDATED',
        result: 'success',
        metadata: { cleared: body.asaasApiKey === '' || body.asaasApiKey === null },
        ip: clientMeta.ip,
        user_agent: clientMeta.userAgent,
      });
    }

    return res.status(200).json({
      success: true,
      shop: mapShopResponse(shop as Record<string, unknown>),
    });
  } catch (e) {
    console.error('[api/admin/shops/[id]/subscription]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao atualizar loja.',
    });
  }
}
