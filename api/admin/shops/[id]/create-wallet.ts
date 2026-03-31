// Vercel Serverless: POST /api/admin/shops/:id/create-wallet
// Cria subconta Asaas para loja que ainda não tem asaas_wallet_id (atualiza a loja com walletId)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = (process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3').replace(/\/$/, '');

function getShopIdFromRequest(req: { url?: string; query?: { id?: string } }): string | null {
  const fromQuery = req.query?.id;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  const rawUrl = req.url || '';
  const pathname = rawUrl.startsWith('http') ? new URL(rawUrl).pathname : rawUrl.split('?')[0];
  const match = pathname.match(/\/api\/admin\/shops\/([^/]+)\/create-wallet/);
  return match ? match[1].trim() : null;
}

export default async function handler(
  req: { method?: string; url?: string; query?: { id?: string }; body?: { cpfCnpj?: string } },
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase indisponível.' });
  }
  if (!ASAAS_API_KEY) {
    return res.status(500).json({ success: false, error: 'ASAAS_API_KEY não configurada.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name, email, phone, cnpj_cpf, asaas_wallet_id')
      .eq('id', shopId)
      .single();

    if (shopError || !shop) {
      return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
    }

    if (shop.asaas_wallet_id != null && String(shop.asaas_wallet_id).trim() !== '') {
      return res.status(400).json({
        success: false,
        error: 'Esta loja já possui carteira Asaas configurada.',
        asaasWalletId: shop.asaas_wallet_id,
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

    const isSandbox = ASAAS_API_URL.toLowerCase().includes('sandbox');
    if (isSandbox && asaasAccountId) {
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
      asaas_account_id: asaasAccountId,
      finance_provision_status: 'active',
      finance_provision_last_error: null,
      finance_provision_updated_at: new Date().toISOString(),
    };
    if (asaasApiKeySub) updates.asaas_api_key = asaasApiKeySub;

    const { data: updated, error: updateError } = await supabase
      .from('shops')
      .update(updates)
      .eq('id', shopId)
      .select('id, asaas_wallet_id, asaas_account_id')
      .single();

    if (updateError) {
      return res.status(500).json({ success: false, error: 'Carteira criada no Asaas, mas falha ao atualizar loja: ' + updateError.message });
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
