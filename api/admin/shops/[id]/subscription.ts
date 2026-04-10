// Vercel Serverless: PATCH /api/admin/shops/:id/subscription
// Atualiza subscription_active, subscription_amount, split_percent (prod) e split_percent_sandbox da loja (service role)

import { insertFinancialAudit } from '../../../../lib/server/financial-audit';
import { assertAdminFromRequest } from '../../../../lib/server/admin-auth';

/** Mesmas colunas que `SHOPS_SELECT_ADMIN` (sem `asaas_api_key` — evita payload/serialização e vazamento). */
const SHOP_ROW_SELECT_AFTER_PATCH =
  'id, owner_id, name, type, description, address, profile_image, banner_image, primary_color, theme, subscription_active, subscription_amount, rating, asaas_account_id, asaas_wallet_id, asaas_customer_id, asaas_platform_subscription_id, cnpj_cpf, email, phone, pix_key, created_at, split_percent, split_percent_sandbox, pass_fees_to_customer, workday_start, workday_end, lunch_start, lunch_end, agenda_slot_minutes, asaas_api_key_configured, finance_provision_status, finance_provision_last_error';

function normalizeJsonBody(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      const p = JSON.parse(t) as unknown;
      if (typeof p === 'object' && p !== null && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function requestPathname(req: { url?: string }): string {
  const raw = req.url || '';
  if (raw.startsWith('http')) {
    try {
      return new URL(raw).pathname;
    } catch {
      return raw.split('?')[0] || '';
    }
  }
  return raw.split('?')[0] || '';
}

function getShopId(req: { query?: { id?: string | string[] }; url?: string }): string | null {
  const q = req.query?.id;
  if (q != null) {
    const one = Array.isArray(q) ? q[0] : q;
    if (one && String(one).trim()) return String(one).trim();
  }
  const pathname = requestPathname(req);
  const match = pathname.match(/\/api\/admin\/shops\/([^/]+)\/subscription/);
  return match ? match[1].trim() : null;
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

function readNonNegativeNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(String(raw).replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function readSplitPercent(raw: unknown): number | null {
  const n = readNonNegativeNumber(raw);
  if (n == null || n > 100) return null;
  return n;
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
    asaasPlatformSubscriptionId:
      shop.asaas_platform_subscription_id != null && String(shop.asaas_platform_subscription_id).trim() !== ''
        ? String(shop.asaas_platform_subscription_id).trim()
        : null,
    rating: shop.rating != null ? Number(shop.rating) : 5,
    splitPercent: shop.split_percent != null ? Number(shop.split_percent) : 95,
    splitPercentSandbox:
      shop.split_percent_sandbox != null ? Number(shop.split_percent_sandbox) : null,
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
    query?: { id?: string | string[] };
    body?: Record<string, unknown> | string;
    headers?: Record<string, string | string[] | undefined>;
  },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'PATCH') {
      return res.status(405).json({ success: false, error: 'Método não permitido. Use PATCH.' });
    }

    const auth = await assertAdminFromRequest(req);
    if (auth.success === false) {
      return res.status(auth.status).json({ success: false, error: auth.error });
    }

    const clientMeta = getClientMeta(req);
    const shopId = getShopId(req);
    if (!shopId) {
      return res.status(400).json({ success: false, error: 'ID da loja não encontrado na URL.' });
    }

    const body = normalizeJsonBody(req.body) as {
      subscriptionActive?: boolean;
      subscriptionAmount?: unknown;
      splitPercent?: unknown;
      splitPercentSandbox?: unknown | null;
      asaasApiKey?: string | null;
      asaasPlatformSubscriptionId?: string | null;
    };

    const updates: Record<string, unknown> = {};
    if (typeof body.subscriptionActive === 'boolean') updates.subscription_active = body.subscriptionActive;

    if (body.subscriptionAmount !== undefined) {
      const a = readNonNegativeNumber(body.subscriptionAmount);
      if (a !== null) updates.subscription_amount = a;
    }

    if (body.splitPercent !== undefined) {
      const s = readSplitPercent(body.splitPercent);
      if (s !== null) updates.split_percent = s;
    }

    if (body.splitPercentSandbox !== undefined) {
      if (body.splitPercentSandbox === null) {
        updates.split_percent_sandbox = null;
      } else {
        const s = readSplitPercent(body.splitPercentSandbox);
        if (s !== null) updates.split_percent_sandbox = s;
      }
    }

    const keyUpdateRequested = body.asaasApiKey !== undefined;
    if (keyUpdateRequested) updates.asaas_api_key = body.asaasApiKey === '' || body.asaasApiKey === null ? null : String(body.asaasApiKey).trim();
    if (body.asaasPlatformSubscriptionId !== undefined) {
      const v = body.asaasPlatformSubscriptionId;
      updates.asaas_platform_subscription_id =
        v === '' || v === null ? null : String(v).trim().slice(0, 200);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error:
          'Envie subscriptionActive, subscriptionAmount, splitPercent, splitPercentSandbox, asaasPlatformSubscriptionId e/ou asaasApiKey.',
      });
    }

    let shop: Record<string, unknown> | null = null;
    let pgError: { message: string; code?: string } | null = null;

    try {
      const result = await auth.supabase
        .from('shops')
        .update(updates)
        .eq('id', shopId)
        .select(SHOP_ROW_SELECT_AFTER_PATCH)
        .single();
      shop = (result.data as Record<string, unknown> | null) ?? null;
      pgError = result.error;
    } catch (e) {
      console.error('[api/admin/shops/[id]/subscription] supabase throw', e);
      return res.status(502).json({
        success: false,
        error: e instanceof Error ? e.message : 'Falha ao comunicar com o banco (Supabase).',
      });
    }

    if (pgError) {
      const msg = pgError.message || 'Erro ao atualizar loja.';
      const hintSandbox =
        msg.toLowerCase().includes('split_percent_sandbox') || msg.includes('PGRST204')
          ? ' Confirme se a migration shops.split_percent_sandbox foi aplicada (npm run db:push).'
          : '';
      return res.status(400).json({ success: false, error: msg + hintSandbox });
    }
    if (!shop) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    if (keyUpdateRequested) {
      try {
        await insertFinancialAudit(auth.supabase, {
          shop_id: shopId,
          actor_user_id: auth.userId,
          action: 'SHOP_API_KEY_UPDATED',
          result: 'success',
          metadata: { cleared: body.asaasApiKey === '' || body.asaasApiKey === null },
          ip: clientMeta.ip,
          user_agent: clientMeta.userAgent,
        });
      } catch (auditErr) {
        console.error('[api/admin/shops/[id]/subscription] audit insert', auditErr);
      }
    }

    let mapped: ReturnType<typeof mapShopResponse>;
    try {
      mapped = mapShopResponse(shop);
      JSON.stringify(mapped);
    } catch (mapErr) {
      console.error('[api/admin/shops/[id]/subscription] map/serialize', mapErr);
      return res.status(500).json({
        success: false,
        error: 'Falha ao montar resposta da loja.',
        details: mapErr instanceof Error ? mapErr.message : String(mapErr),
      });
    }

    return res.status(200).json({
      success: true,
      shop: mapped,
    });
  } catch (e) {
    console.error('[api/admin/shops/[id]/subscription]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao atualizar loja.',
    });
  }
}
