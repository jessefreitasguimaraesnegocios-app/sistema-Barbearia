import { createClient } from '@supabase/supabase-js';
import { resolveSplitPercentForRuntime, resolveShopSplitPercent } from '../../../lib/payments/resolve-shop-split';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ASAAS_PROVISIONER_URL = process.env.ASAAS_PROVISIONER_URL;
const ASAAS_PROVISIONER_TOKEN = process.env.ASAAS_PROVISIONER_TOKEN;
const ASAAS_PROVISIONER_APP_ID = process.env.ASAAS_PROVISIONER_APP_ID;
const ASAAS_PROVISIONER_ENV = process.env.ASAAS_PROVISIONER_ENV;
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

type ProvisionRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
  birth_date: string | null;
  split_percent: number | null;
  split_percent_sandbox: number | null;
  asaas_wallet_id: string | null;
  asaas_wallet_id_prod?: string | null;
  asaas_wallet_id_sandbox?: string | null;
};

function normalizePhone(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 11) return digits.slice(0, 11);
  if (digits.length === 10) return `${digits.slice(0, 2)}9${digits.slice(2)}`;
  return '11999999999';
}

function resolveEnvironment(): 'sandbox' | 'production' {
  if (ASAAS_PROVISIONER_ENV === 'sandbox' || ASAAS_PROVISIONER_ENV === 'production') {
    return ASAAS_PROVISIONER_ENV;
  }
  return ASAAS_API_URL.includes('sandbox') ? 'sandbox' : 'production';
}

export default async function handler(
  req: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: { shopId?: string } },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void } }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, authorization, apikey');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }
  if (!ASAAS_PROVISIONER_URL || !ASAAS_PROVISIONER_APP_ID) {
    return res.status(500).json({
      success: false,
      error: 'Configuração do provisionador indisponível (ASAAS_PROVISIONER_URL/ASAAS_PROVISIONER_APP_ID).',
    });
  }

  try {
    const rawAuth = req.headers?.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ success: false, error: 'Não autorizado: token ausente.' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUserId = authData?.user?.id;
    if (authErr || !authUserId) return res.status(401).json({ success: false, error: 'Não autorizado: token inválido.' });

    const shopId = req.body?.shopId?.trim();
    if (!shopId) return res.status(400).json({ success: false, error: 'shopId é obrigatório.' });

    const { data: allowedByRateLimit, error: rateErr } = await supabase.rpc('security_check_rate_limit', {
      p_route: 'provision-wallets',
      p_subject: `provision-wallets:${authUserId}:${shopId}`,
      p_limit: 4,
      p_window_seconds: 60,
    });
    if (rateErr) {
      return res.status(500).json({ success: false, error: `Falha no rate limit: ${rateErr.message}` });
    }
    if (allowedByRateLimit === false) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas de provisionamento. Aguarde 1 minuto e tente novamente.',
      });
    }

    const { data: shop, error: shopErr } = await supabase
      .from('shops')
      .select('id, owner_id, name, email, phone, cnpj_cpf, split_percent, split_percent_sandbox, address')
      .eq('id', shopId)
      .single();
    if (shopErr || !shop) return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    if (shop.owner_id !== authUserId) return res.status(403).json({ success: false, error: 'Não autorizado para esta loja.' });

    const { data: pros, error: prosErr } = await supabase
      .from('professionals')
      .select(
        'id, name, email, phone, cpf_cnpj, birth_date, split_percent, split_percent_sandbox, asaas_wallet_id, asaas_wallet_id_prod, asaas_wallet_id_sandbox'
      )
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true });
    if (prosErr) return res.status(500).json({ success: false, error: prosErr.message });

    const environment = resolveEnvironment();
    const shopSplitForEnv = resolveShopSplitPercent(environment, shop as Record<string, unknown>);
    const missingWallet = (pros || []).filter((p) => {
      const envWallet =
        environment === 'sandbox'
          ? p.asaas_wallet_id_sandbox
          : p.asaas_wallet_id_prod;
      return !envWallet || String(envWallet).trim() === '';
    }) as ProvisionRow[];
    if (missingWallet.length === 0) {
      return res.status(200).json({ success: true, processed: 0, created: 0, failures: [] });
    }

    const updates: Array<Record<string, unknown>> = [];
    const failures: Array<{ professionalId: string; reason: string }> = [];
    const shopCpfCnpj = String(shop.cnpj_cpf || '').replace(/\D/g, '');
    const shopDomain = String(shop.email || 'barbearia.local').split('@')[1] || 'barbearia.local';
    const shopAddress = String(shop.address || 'A definir').trim() || 'A definir';
    const defaultSplit = shopSplitForEnv;

    for (const p of missingWallet) {
      const proCpfCnpj = String(p.cpf_cnpj || '').replace(/\D/g, '') || shopCpfCnpj;
      const proEmail = (p.email && p.email.trim()) || `profissional.${p.id.slice(0, 8)}@${shopDomain}`;
      const proPhone = normalizePhone(p.phone || String(shop.phone || ''));
      const splitPercent = resolveSplitPercentForRuntime(environment, p as Record<string, unknown>, defaultSplit);
      const payload = {
        app_id: ASAAS_PROVISIONER_APP_ID,
        environment,
        name: String(p.name || 'Profissional').trim(),
        email: proEmail,
        loginEmail: proEmail,
        cpfCnpj: proCpfCnpj,
        birthDate: p.birth_date || '1990-01-01',
        companyType: proCpfCnpj.length === 11 ? 'INDIVIDUAL' : 'MEI',
        phone: proPhone,
        mobilePhone: proPhone,
        incomeValue: 2500,
        address: shopAddress,
        addressNumber: 'S/N',
        province: 'Centro',
        postalCode: '01310100',
        splitPercent: Number.isFinite(splitPercent) ? Math.max(0, Math.min(100, splitPercent)) : 95,
      };

      const response = await fetch(ASAAS_PROVISIONER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ASAAS_PROVISIONER_TOKEN ? { Authorization: `Bearer ${ASAAS_PROVISIONER_TOKEN}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      if (!response.ok || data?.success === false || !data?.subaccount?.asaas_wallet_id) {
        failures.push({
          professionalId: p.id,
          reason: data?.error || data?.details?.error || rawText || `Falha HTTP ${response.status}`,
        });
        continue;
      }

      const sub = data.subaccount as {
        asaas_subaccount_id?: string;
        asaas_wallet_id?: string;
        asaas_api_key?: string;
        apiKey?: string;
      };
      const apiKeyFromProv =
        (typeof sub.asaas_api_key === 'string' && sub.asaas_api_key.trim()) ||
        (typeof sub.apiKey === 'string' && sub.apiKey.trim()) ||
        null;

      const row: Record<string, unknown> = {
        id: p.id,
        shop_id: shopId,
        asaas_account_id: sub.asaas_subaccount_id ?? null,
        asaas_wallet_id: sub.asaas_wallet_id ?? null,
        asaas_wallet_id_prod: environment === 'production' ? (sub.asaas_wallet_id ?? null) : undefined,
        asaas_wallet_id_sandbox: environment === 'sandbox' ? (sub.asaas_wallet_id ?? null) : undefined,
        asaas_environment: environment,
        ...(environment === 'sandbox'
          ? { split_percent_sandbox: payload.splitPercent }
          : { split_percent: payload.splitPercent }),
      };
      if (apiKeyFromProv) row.asaas_api_key = apiKeyFromProv;
      updates.push(row);
    }

    if (updates.length > 0) {
      const { error: upsertErr } = await supabase.from('professionals').upsert(updates, { onConflict: 'id' });
      if (upsertErr) {
        return res.status(500).json({ success: false, error: `Falha ao salvar carteiras: ${upsertErr.message}` });
      }
    }

    return res.status(200).json({
      success: true,
      processed: missingWallet.length,
      created: updates.length,
      failures,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Erro interno' });
  }
}
