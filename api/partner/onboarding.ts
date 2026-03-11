// Vercel Serverless: GET /api/partner/onboarding
// Retorna status da conta Asaas e links para envio de documentos (onboarding). Requer JWT do parceiro.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = (process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3').replace(/\/$/, '');

async function getPartnerShopId(token: string): Promise<{ shopId: string } | { error: string; status: number }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do servidor indisponível.' });
  }
  if (!ASAAS_API_KEY) {
    return res.status(500).json({ success: false, error: 'Gateway de pagamento não configurado.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, asaas_account_id, asaas_api_key, asaas_wallet_id')
    .eq('id', partner.shopId)
    .single();

  if (shopError || !shop) {
    return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
  }

  let subAccountKey: string | null = (shop as { asaas_api_key?: string }).asaas_api_key?.trim() || null;
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
      const tokenRes = await fetch(`${ASAAS_API_URL}/accounts/${asaasAccountId}/accessTokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify({ name: 'BeautyHub Onboarding' }),
      });
      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { apiKey?: string };
        const newKey = tokenData?.apiKey?.trim();
        if (newKey) {
          await supabase.from('shops').update({ asaas_api_key: newKey }).eq('id', partner.shopId);
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
      fetch(`${ASAAS_API_URL}/myAccount/status`, {
        headers: { access_token: subAccountKey },
      }),
      fetch(`${ASAAS_API_URL}/myAccount/documents`, {
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
      const docsData = (await docsRes.json()) as { data?: Array<{ id?: string; title?: string; description?: string; status?: string; onboardingUrl?: string }> };
      const list = docsData?.data ?? [];
      documents = list
        .filter((d) => d?.id)
        .map((d) => ({
          id: String(d.id),
          title: d.title ?? 'Documento',
          description: d.description ?? undefined,
          status: d.status ?? 'PENDING',
          onboardingUrl: d.onboardingUrl ?? undefined,
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
