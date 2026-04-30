// Vercel Serverless: POST /api/admin/shops/:id/create-wallet
// Cria subconta Asaas para loja que ainda não tem asaas_wallet_id (atualiza a loja com walletId)

import {
  asaasRuntimeModeFromPlatformRow,
  parseShopAsaasRuntimeOverride,
  resolveEffectiveAsaasRuntimeMode,
} from '../../../../lib/payments/resolve-shop-split';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type RuntimeMode = 'production' | 'sandbox';
type AdminAuthResult =
  | { success: true; supabase: SupabaseClient; userId: string }
  | { success: false; status: number; error: string };

function parseFirstStringFromJsonMap(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const map = parsed as Record<string, unknown>;
    const preferredKeys = ['service_role', 'serviceRole', 'anon', 'publishable', 'default'];
    for (const key of preferredKeys) {
      const value = map[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    for (const value of Object.values(map)) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }
  return null;
}

async function assertAdminFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
}): Promise<AdminAuthResult> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SECRET_KEY ||
    parseFirstStringFromJsonMap(process.env.SUPABASE_SECRET_KEYS);
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    parseFirstStringFromJsonMap(process.env.SUPABASE_PUBLISHABLE_KEYS);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { success: false as const, status: 500, error: 'Configuração do Supabase indisponível.' };
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { success: false as const, status: 401, error: 'Token de autorização não enviado. Faça login novamente.' };
  }

  let authRes: Response;
  try {
    authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
  } catch {
    return { success: false as const, status: 502, error: 'Não foi possível validar a sessão (rede). Tente de novo.' };
  }
  if (!authRes.ok) {
    return { success: false as const, status: 401, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }
  const userData = (await authRes.json()) as { id?: string };
  const userId = userData?.id;
  if (!userId) {
    return { success: false as const, status: 401, error: 'Token inválido.' };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { success: false as const, status: 403, error: 'Apenas administradores.' };
  }

  return { success: true as const, supabase, userId };
}

function apiKeyColumnByMode(mode: RuntimeMode): 'asaas_api_key_prod' | 'asaas_api_key_sandbox' {
  return mode === 'sandbox' ? 'asaas_api_key_sandbox' : 'asaas_api_key_prod';
}

function asaasCredentialsForMode(mode: RuntimeMode): { apiKey: string; apiUrl: string } {
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

function getShopIdFromRequest(req: { url?: string; query?: { id?: string } }): string | null {
  const fromQuery = req.query?.id;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  const rawUrl = req.url || '';
  const pathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.split('?')[0];
  const match = pathname.match(/\/api\/admin\/shops\/([^/]+)\/create-wallet/);
  return match ? match[1].trim() : null;
}

export default async function handler(
  req: {
    method?: string;
    url?: string;
    query?: { id?: string };
    body?: { cpfCnpj?: string };
    headers?: Record<string, string | string[] | undefined>;
  },
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

    const [{ data: plat }, { data: shop, error: shopError }] = await Promise.all([
      supabase.from('platform_runtime_settings').select('asaas_mode').eq('singleton_id', true).maybeSingle(),
      supabase
        .from('shops')
        .select(
          'id, name, email, phone, cnpj_cpf, asaas_wallet_id, asaas_wallet_id_prod, asaas_wallet_id_sandbox, asaas_runtime_mode'
        )
        .eq('id', shopId)
        .single(),
    ]);

    if (shopError || !shop) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    const platformMode = asaasRuntimeModeFromPlatformRow(plat);
    const shopOverride = parseShopAsaasRuntimeOverride(
      (shop as { asaas_runtime_mode?: unknown }).asaas_runtime_mode
    );
    const runtimeMode = resolveEffectiveAsaasRuntimeMode(platformMode, shopOverride);
    const { apiKey: ASAAS_API_KEY, apiUrl: ASAAS_API_URL } = asaasCredentialsForMode(runtimeMode);

    if (!ASAAS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: `ASAAS_API_KEY não configurada para o ambiente ${runtimeMode} (conta mãe).`,
      });
    }

    const walletColumn = runtimeMode === 'sandbox' ? 'asaas_wallet_id_sandbox' : 'asaas_wallet_id_prod';
    const apiKeyColumn = apiKeyColumnByMode(runtimeMode);

    const currentEnvWallet = (shop as Record<string, unknown>)[walletColumn];
    if (currentEnvWallet != null && String(currentEnvWallet).trim() !== '') {
      return res.status(400).json({
        success: false,
        error: `Esta loja já possui carteira Asaas configurada para ${runtimeMode}.`,
        asaasWalletId: String(currentEnvWallet),
      });
    }

    const cpfCnpjFromBody = req.body?.cpfCnpj != null ? String(req.body.cpfCnpj).replace(/\D/g, '') : '';
    const cpfCnpjFromShop = shop.cnpj_cpf != null ? String(shop.cnpj_cpf).replace(/\D/g, '') : '';
    const cpfCnpjDigits = cpfCnpjFromBody || cpfCnpjFromShop;

    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      return res.status(400).json({
        success: false,
        error: 'CPF/CNPJ obrigatório para criar subconta Asaas. Informe no corpo da requisição { "cpfCnpj": "..." } ou cadastre na loja (cnpj_cpf).',
      });
    }

    const name = String(shop.name || 'Loja').trim();
    const email = String(shop.email || '').trim();
    const phone = String(shop.phone || '').replace(/\D/g, '').slice(0, 11) || '11999999999';
    const mobilePhone = phone.length >= 10 ? phone : '11999999999';

    const accountRes = await fetch(`${ASAAS_API_URL}/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name,
        email,
        loginEmail: email,
        cpfCnpj: cpfCnpjDigits,
        birthDate: '1990-01-01',
        companyType: 'MEI',
        phone: String(shop.phone || '') || null,
        mobilePhone,
        incomeValue: 5000,
        address: 'A definir',
        addressNumber: 'S/N',
        province: 'Centro',
        postalCode: '01310100',
      }),
    });

    if (!accountRes.ok) {
      const errText = await accountRes.text();
      let errMessage = 'Falha ao criar subconta Asaas (carteira da loja).';
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.errors?.[0]?.description) errMessage = errJson.errors[0].description;
        else if (errJson?.error) errMessage = errJson.error;
      } catch (_) {}
      return res.status(400).json({ success: false, error: errMessage, details: errText });
    }

    const accountData = (await accountRes.json()) as { walletId?: string; wallet?: string; id?: string; accountId?: string };
    const walletId = (accountData?.walletId ?? accountData?.wallet ?? null)?.trim() || null;
    const asaasAccountId = (accountData?.id ?? accountData?.accountId ?? null)?.trim() || null;

    if (!walletId) {
      return res.status(500).json({
        success: false,
        error: 'Asaas não retornou walletId. Não foi possível vincular a carteira à loja.',
      });
    }

    if (runtimeMode === 'sandbox' && asaasAccountId) {
      try {
        const approveRes = await fetch(`${ASAAS_API_URL}/accounts/${asaasAccountId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
        });
        if (!approveRes.ok) {
          console.warn('[create-wallet] Sandbox approve (opcional):', approveRes.status, await approveRes.text());
        }
      } catch (_) {}
    }

    let asaasApiKeySub: string | null = null;
    if (asaasAccountId) {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const tokenRes = await fetch(`${ASAAS_API_URL}/accounts/${asaasAccountId}/accessTokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: ASAAS_API_KEY,
          },
          body: JSON.stringify({ name: 'Smart Cria App' }),
        });
        if (tokenRes.ok) {
          const tokenData = (await tokenRes.json()) as { apiKey?: string };
          const key = tokenData?.apiKey?.trim();
          if (key) asaasApiKeySub = key;
        } else {
          console.error('[create-wallet] accessTokens:', tokenRes.status, await tokenRes.text());
        }
      } catch (e) {
        console.error('[create-wallet] accessTokens error:', e);
      }
    }

    const updates: Record<string, unknown> = {
      asaas_wallet_id: walletId,
      [walletColumn]: walletId,
      asaas_account_id: asaasAccountId,
    };
    if (asaasApiKeySub) {
      updates.asaas_api_key = asaasApiKeySub;
      updates[apiKeyColumn] = asaasApiKeySub;
    }

    const { data: updated, error: updateError } = await supabase
      .from('shops')
      .update(updates)
      .eq('id', shopId)
      .select('id, asaas_wallet_id, asaas_account_id')
      .single();

    if (updateError) {
      return res.status(500).json({ success: false, error: 'Carteira criada no Asaas, mas falha ao atualizar loja: ' + updateError.message });
    }

    const ts = new Date().toISOString();
    const { error: fpErr } = await supabase.from('shop_finance_provision').upsert(
      {
        shop_id: shopId,
        finance_provision_status: 'active',
        finance_provision_last_error: null,
        finance_provision_updated_at: ts,
      },
      { onConflict: 'shop_id' }
    );
    if (fpErr) {
      return res.status(500).json({
        success: false,
        error: 'Carteira vinculada em shops, mas falha ao gravar shop_finance_provision: ' + fpErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Carteira Asaas criada e vinculada à loja.' + (asaasApiKeySub ? ' Chave da subconta gerada e salva.' : ' Configure a chave da subconta manualmente (Integrações no Asaas) ou pelo onboarding.'),
      shop: {
        id: updated?.id,
        asaasWalletId: (updated as { asaas_wallet_id?: string })?.asaas_wallet_id,
        asaasAccountId: (updated as { asaas_account_id?: string })?.asaas_account_id,
        asaasApiKeyConfigured: !!asaasApiKeySub,
      },
    });
  } catch (e) {
    console.error('[api/admin/shops/[id]/create-wallet]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao criar carteira.',
    });
  }
}
