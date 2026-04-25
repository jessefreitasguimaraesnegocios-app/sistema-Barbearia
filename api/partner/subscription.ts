// Vercel Serverless: GET /api/partner/subscription
// Retorna contexto de assinatura da plataforma para a loja parceira e um link de checkout/regularização.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

type RuntimeMode = 'production' | 'sandbox';

function asaasRuntimeModeFromPlatformRow(data: { asaas_mode?: unknown } | null | undefined): RuntimeMode {
  return data?.asaas_mode === 'sandbox' ? 'sandbox' : 'production';
}

function platformAsaasConfigForMode(mode: RuntimeMode): { mode: RuntimeMode; apiKey: string; apiUrl: string } {
  const defaultProd = 'https://api.asaas.com/v3';
  const defaultSandbox = 'https://api-sandbox.asaas.com/v3';
  if (mode === 'sandbox') {
    return {
      mode,
      apiKey: (process.env.ASAAS_API_KEY_SANDBOX || process.env.ASAAS_API_KEY || '').trim(),
      apiUrl: (process.env.ASAAS_API_URL_SANDBOX || process.env.ASAAS_API_URL || defaultSandbox).replace(/\/$/, ''),
    };
  }
  return {
    mode,
    apiKey: (process.env.ASAAS_API_KEY || '').trim(),
    apiUrl: (process.env.ASAAS_API_URL || defaultProd).replace(/\/$/, ''),
  };
}

function normalizeAsaasMobilePhone(rawPhone: unknown): string {
  const fallback = '11999999999';
  if (rawPhone == null) return fallback;
  let digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return fallback;
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  if (digits.length === 10) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (!/^\d{2}9\d{8}$/.test(digits)) return fallback;
  return digits;
}

function nextMonthlyDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function asaasErrorMessageFromText(raw: string, fallback: string): string {
  try {
    const j = JSON.parse(raw) as { errors?: Array<{ description?: string }>; error?: string };
    return j?.errors?.[0]?.description || j?.error || raw || fallback;
  } catch {
    return raw || fallback;
  }
}

async function ensurePlatformCustomerInAsaas(params: {
  apiUrl: string;
  apiKey: string;
  shopName: string;
  shopEmail: string;
  shopPhone: string;
  cnpjCpfDigits: string;
  existingAsaasCustomerId: string | null;
}): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', access_token: params.apiKey };
  const base = params.apiUrl;
  if (params.existingAsaasCustomerId) return params.existingAsaasCustomerId;

  const cpfOrCnpj =
    params.cnpjCpfDigits.length === 11 || params.cnpjCpfDigits.length === 14
      ? params.cnpjCpfDigits
      : '';

  if (cpfOrCnpj) {
    const lookupByCpf = await fetch(`${base}/customers?cpfCnpj=${encodeURIComponent(cpfOrCnpj)}&limit=1&offset=0`, {
      method: 'GET',
      headers,
    });
    if (lookupByCpf.ok) {
      const data = (await lookupByCpf.json()) as { data?: Array<{ id?: string }> };
      const existing = data?.data?.[0]?.id?.trim();
      if (existing) return existing;
    }
  }

  if (params.shopEmail) {
    const lookupByEmail = await fetch(`${base}/customers?email=${encodeURIComponent(params.shopEmail)}&limit=1&offset=0`, {
      method: 'GET',
      headers,
    });
    if (lookupByEmail.ok) {
      const data = (await lookupByEmail.json()) as { data?: Array<{ id?: string }> };
      const existing = data?.data?.[0]?.id?.trim();
      if (existing) return existing;
    }
  }

  const createRes = await fetch(`${base}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: params.shopName,
      email: params.shopEmail || undefined,
      mobilePhone: normalizeAsaasMobilePhone(params.shopPhone),
      cpfCnpj: cpfOrCnpj || undefined,
    }),
  });
  const createTxt = await createRes.text();
  if (!createRes.ok) {
    throw new Error(asaasErrorMessageFromText(createTxt, 'Não foi possível criar cliente da mensalidade no Asaas.'));
  }
  const created = JSON.parse(createTxt) as { id?: string };
  const customerId = created?.id?.trim();
  if (!customerId) throw new Error('Asaas não retornou customer id ao criar cliente da mensalidade.');
  return customerId;
}

async function createPlatformMonthlySubscription(params: {
  apiUrl: string;
  apiKey: string;
  customerId: string;
  amount: number;
  shopName: string;
  shopId: string;
}): Promise<string> {
  const res = await fetch(`${params.apiUrl}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: params.apiKey },
    body: JSON.stringify({
      customer: params.customerId,
      billingType: 'UNDEFINED',
      cycle: 'MONTHLY',
      value: params.amount,
      nextDueDate: nextMonthlyDueDate(),
      description: `Mensalidade plataforma - ${params.shopName}`.slice(0, 120),
      externalReference: `shop:${params.shopId}:platform-subscription`,
    }),
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(asaasErrorMessageFromText(txt, 'Não foi possível criar assinatura mensal no Asaas.'));
  }
  const data = JSON.parse(txt) as { id?: string };
  const id = data?.id?.trim();
  if (!id) throw new Error('Asaas não retornou id da assinatura mensal criada.');
  return id;
}

async function resolvePartnerShopId(token: string): Promise<{ userId: string; shopId: string } | { error: string; status: number }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Configuração indisponível.', status: 500 };
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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('shop_id, role')
    .eq('id', userId)
    .single();
  if (profileError || !profile) return { error: 'Perfil não encontrado.', status: 403 };

  const role = (profile as { role?: string }).role;
  const shopId = (profile as { shop_id?: string | null }).shop_id;
  if (role !== 'barbearia' || !shopId) {
    return { error: 'Acesso apenas para dono da loja.', status: 403 };
  }
  return { userId, shopId };
}

type AsaasPaymentRow = {
  id?: string;
  status?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  dueDate?: string;
};

function pickCheckoutUrl(payment: AsaasPaymentRow | null): string | null {
  if (!payment) return null;
  const invoice = payment.invoiceUrl != null ? String(payment.invoiceUrl).trim() : '';
  if (invoice) return invoice;
  const billet = payment.bankSlipUrl != null ? String(payment.bankSlipUrl).trim() : '';
  if (billet) return billet;
  return null;
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void; end: () => void };
  }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use GET.' });
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Token não enviado.' });

  const partner = await resolvePartnerShopId(token);
  if ('error' in partner) return res.status(partner.status).json({ success: false, error: partner.error });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do servidor indisponível.' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const [{ data: platformRuntime }, { data: shopRow, error: shopError }] = await Promise.all([
      supabase
        .from('platform_runtime_settings')
        .select('asaas_mode')
        .eq('singleton_id', true)
        .maybeSingle(),
      supabase
        .from('shops')
        .select(
          'id, name, email, phone, cnpj_cpf, subscription_amount, subscription_active, billing_status, asaas_customer_id, asaas_platform_subscription_id'
        )
        .eq('id', partner.shopId)
        .single(),
    ]);

    if (shopError || !shopRow) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    const runtimeMode = asaasRuntimeModeFromPlatformRow(platformRuntime as { asaas_mode?: unknown } | null | undefined);
    const config = platformAsaasConfigForMode(runtimeMode);
    if (!config.apiKey) {
      return res.status(500).json({ success: false, error: 'Chave de cobrança indisponível no servidor.' });
    }

    const amount = shopRow.subscription_amount != null ? Number(shopRow.subscription_amount) : 99;
    const shopName = String(shopRow.name || 'Estabelecimento').trim() || 'Estabelecimento';
    const currentSubId =
      shopRow.asaas_platform_subscription_id != null && String(shopRow.asaas_platform_subscription_id).trim() !== ''
        ? String(shopRow.asaas_platform_subscription_id).trim()
        : null;
    const currentCustomerId =
      shopRow.asaas_customer_id != null && String(shopRow.asaas_customer_id).trim() !== ''
        ? String(shopRow.asaas_customer_id).trim()
        : null;

    const customerId = await ensurePlatformCustomerInAsaas({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      shopName,
      shopEmail: String(shopRow.email || '').trim(),
      shopPhone: String(shopRow.phone || '').trim(),
      cnpjCpfDigits: String(shopRow.cnpj_cpf || '').replace(/\D/g, ''),
      existingAsaasCustomerId: currentCustomerId,
    });

    let subscriptionId = currentSubId;
    if (!subscriptionId) {
      subscriptionId = await createPlatformMonthlySubscription({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        customerId,
        amount,
        shopName,
        shopId: partner.shopId,
      });
      const patch: Record<string, unknown> = {
        asaas_platform_subscription_id: subscriptionId,
      };
      if (!currentCustomerId) patch.asaas_customer_id = customerId;
      await supabase.from('shops').update(patch).eq('id', partner.shopId);
    } else if (!currentCustomerId) {
      await supabase.from('shops').update({ asaas_customer_id: customerId }).eq('id', partner.shopId);
    }

    const pendingPaymentsRes = await fetch(
      `${config.apiUrl}/payments?subscription=${encodeURIComponent(subscriptionId)}&status=PENDING&limit=1&offset=0`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', access_token: config.apiKey },
      }
    );
    let checkoutUrl: string | null = null;
    let pendingPayment: AsaasPaymentRow | null = null;
    if (pendingPaymentsRes.ok) {
      const pendingPayload = (await pendingPaymentsRes.json()) as { data?: AsaasPaymentRow[] };
      pendingPayment = pendingPayload?.data?.[0] ?? null;
      checkoutUrl = pickCheckoutUrl(pendingPayment);
    }

    if (!checkoutUrl) {
      const allPaymentsRes = await fetch(
        `${config.apiUrl}/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1&offset=0`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', access_token: config.apiKey },
        }
      );
      if (allPaymentsRes.ok) {
        const allPayload = (await allPaymentsRes.json()) as { data?: AsaasPaymentRow[] };
        const latest = allPayload?.data?.[0] ?? null;
        checkoutUrl = pickCheckoutUrl(latest);
      }
    }

    return res.status(200).json({
      success: true,
      billing: {
        status: shopRow.billing_status != null ? String(shopRow.billing_status).toLowerCase() : null,
        subscriptionActive: shopRow.subscription_active === true,
        amount,
      },
      asaas: {
        runtimeMode: runtimeMode,
        customerId,
        subscriptionId,
        pendingPaymentId: pendingPayment?.id ?? null,
        checkoutUrl,
      },
    });
  } catch (e) {
    console.error('[api/partner/subscription]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao preparar assinatura.',
    });
  }
}
