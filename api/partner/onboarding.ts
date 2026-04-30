// Vercel Serverless: GET /api/partner/onboarding
// Retorna status da conta Asaas e links para envio de documentos (onboarding). Requer JWT do parceiro.

import { createClient } from '@supabase/supabase-js';
import {
  asaasRuntimeModeFromPlatformRow,
  parseShopAsaasRuntimeOverride,
  resolveEffectiveAsaasRuntimeMode,
} from '../../lib/payments/resolve-shop-split';
import {
  describeMissingSupabaseServerEnv,
  resolveSupabaseAnonKey,
  resolveSupabaseProjectUrl,
  resolveSupabaseServiceRoleKey,
} from '../../lib/server/supabaseServerEnv';
type RuntimeMode = 'production' | 'sandbox';

function platformAsaasRuntimeConfig(mode: RuntimeMode): { apiKey: string; apiUrl: string } {
  const defaultProd = 'https://api.asaas.com/v3';
  const defaultSandbox = 'https://api-sandbox.asaas.com/v3';
  if (mode === 'sandbox') {
    return {
      apiKey: (process.env.ASAAS_API_KEY_SANDBOX || process.env.ASAAS_API_KEY || '').trim(),
      apiUrl: (process.env.ASAAS_API_URL_SANDBOX || process.env.ASAAS_API_URL || defaultSandbox).replace(/\/$/, ''),
    };
  }
  return {
    apiKey: (process.env.ASAAS_API_KEY || '').trim(),
    apiUrl: (process.env.ASAAS_API_URL || defaultProd).replace(/\/$/, ''),
  };
}

function shopApiKeyByRuntime(
  mode: RuntimeMode,
  row: { asaas_api_key_prod?: unknown; asaas_api_key_sandbox?: unknown; asaas_api_key?: unknown }
): string {
  const preferred =
    mode === 'sandbox'
      ? row.asaas_api_key_sandbox
      : row.asaas_api_key_prod;
  const normalizedPreferred =
    preferred != null && String(preferred).trim() !== '' ? String(preferred).trim() : '';
  if (normalizedPreferred) return normalizedPreferred;
  const legacy = row.asaas_api_key;
  return legacy != null && String(legacy).trim() !== '' ? String(legacy).trim() : '';
}

async function getPartnerShopId(token: string): Promise<{ shopId: string } | { error: string; status: number }> {
  const SUPABASE_URL = resolveSupabaseProjectUrl();
  const SUPABASE_ANON_KEY = resolveSupabaseAnonKey();
  const SUPABASE_SERVICE_ROLE_KEY = resolveSupabaseServiceRoleKey();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: describeMissingSupabaseServerEnv(), status: 500 };
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

  if (profileError || !profile) {
    return { error: 'Perfil não encontrado.', status: 403 };
  }
  const role = (profile as { role?: string }).role;
  const shopId = (profile as { shop_id?: string }).shop_id;
  if (role !== 'barbearia' || !shopId) {
    return { error: 'Acesso apenas para parceiros (lojas).', status: 403 };
  }
  return { shopId };
}

export default async function handler(
  req: { method?: string; headers?: { authorization?: string } },
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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use GET.' });
  }

  const authHeader = req.headers?.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não enviado. Faça login novamente.' });
  }

  const partner = await getPartnerShopId(token);
  if ('error' in partner) {
    return res.status(partner.status).json({ success: false, error: partner.error });
  }

  const SUPABASE_URL = resolveSupabaseProjectUrl();
  const SUPABASE_SERVICE_ROLE_KEY = resolveSupabaseServiceRoleKey();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: describeMissingSupabaseServerEnv() });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, asaas_account_id, asaas_api_key, asaas_api_key_prod, asaas_api_key_sandbox, asaas_wallet_id, asaas_runtime_mode')
    .eq('id', partner.shopId)
    .single();

  if (shopError || !shop) {
    return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
  }

  const { data: platformRuntime } = await supabase
    .from('platform_runtime_settings')
    .select('asaas_mode')
    .eq('singleton_id', true)
    .maybeSingle();
  const platformMode = asaasRuntimeModeFromPlatformRow(platformRuntime);
  const shopOverride = parseShopAsaasRuntimeOverride((shop as { asaas_runtime_mode?: unknown }).asaas_runtime_mode);
  const runtimeMode = resolveEffectiveAsaasRuntimeMode(platformMode, shopOverride);
  const platformRuntimeConfig = platformAsaasRuntimeConfig(runtimeMode);
  if (!platformRuntimeConfig.apiKey) {
    return res.status(500).json({ success: false, error: 'Gateway de pagamento não configurado para o ambiente da loja.' });
  }

  let subAccountKey: string | null = shopApiKeyByRuntime(runtimeMode, shop as {
    asaas_api_key?: unknown;
    asaas_api_key_prod?: unknown;
    asaas_api_key_sandbox?: unknown;
  }) || null;
  const asaasAccountId = (shop as { asaas_account_id?: string }).asaas_account_id?.trim() || null;
  const hasWallet = (shop as { asaas_wallet_id?: string }).asaas_wallet_id != null;

  if (!hasWallet && !asaasAccountId) {
    return res.status(200).json({
      success: true,
      accountStatus: null,
      documents: [],
      error: 'Sua loja ainda não tem conta de pagamentos configurada. Entre em contato com o suporte.',
    });
  }

  // Se não temos chave mas temos id da conta, tentar criar (sem Whitelist de IP = qualquer IP aceito)
  if (!subAccountKey && asaasAccountId) {
    try {
      const tokenRes = await fetch(`${platformRuntimeConfig.apiUrl}/accounts/${asaasAccountId}/accessTokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: platformRuntimeConfig.apiKey,
        },
        body: JSON.stringify({ name: 'Smart Cria Onboarding' }),
      });
      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { apiKey?: string };
        const newKey = tokenData?.apiKey?.trim();
        if (newKey) {
          const updates: Record<string, unknown> = { asaas_api_key: newKey };
          if (runtimeMode === 'sandbox') {
            updates.asaas_api_key_sandbox = newKey;
          } else {
            updates.asaas_api_key_prod = newKey;
          }
          await supabase.from('shops').update(updates).eq('id', partner.shopId);
          subAccountKey = newKey;
        }
      }
    } catch (_) {}
  }

  if (!subAccountKey) {
    return res.status(200).json({
      success: true,
      accountStatus: null,
      documents: [],
      error: 'Para enviar documentos, o suporte precisa configurar a chave da sua subconta. Entre em contato.',
    });
  }

  try {
    const [statusRes, docsRes] = await Promise.all([
      fetch(`${platformRuntimeConfig.apiUrl}/myAccount/status`, {
        headers: { access_token: subAccountKey },
      }),
      fetch(`${platformRuntimeConfig.apiUrl}/myAccount/documents`, {
        headers: { access_token: subAccountKey },
      }),
    ]);

    let accountStatus: Record<string, string> | null = null;
    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as Record<string, string>;
      accountStatus = {
        general: statusData.general ?? 'PENDING',
        documentation: statusData.documentation ?? 'PENDING',
        commercialInfo: statusData.commercialInfo ?? 'PENDING',
        bankAccountInfo: statusData.bankAccountInfo ?? 'PENDING',
      };
    }

    let documents: Array<{ id: string; title: string; description?: string; status?: string; onboardingUrl?: string }> = [];
    if (docsRes.ok) {
      const rawDocs = (await docsRes.json()) as
        | { data?: Array<Record<string, unknown>> }
        | Array<Record<string, unknown>>;
      const list = Array.isArray(rawDocs) ? rawDocs : (rawDocs?.data ?? []);
      documents = list
        .filter((d) => d && (d.id != null || d.title != null))
        .map((d) => ({
          id: String(d.id ?? d.title ?? Math.random().toString(36)),
          title: String(d.title ?? d.description ?? 'Documento'),
          description: d.description != null ? String(d.description) : undefined,
          status: d.status != null ? String(d.status) : 'PENDING',
          onboardingUrl: (d.onboardingUrl ?? d.onboarding_url) != null
            ? String(d.onboardingUrl ?? d.onboarding_url).trim()
            : undefined,
        }));
    }

    return res.status(200).json({
      success: true,
      accountStatus,
      documents,
    });
  } catch (e) {
    console.error('[api/partner/onboarding]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao consultar documentos.',
    });
  }
}
