// Vercel Serverless: GET /api/partner/wallet (saldo + opcional histórico) | POST /api/partner/wallet (saque)
// Usa a chave da subconta (asaas_api_key) para GET /v3/finance/balance, GET /v3/financialTransactions e POST /v3/transfers.

import { createClient } from '@supabase/supabase-js';
import { insertFinancialAudit } from '../lib/financial-audit';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ASAAS_API_URL = (process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3').replace(/\/$/, '');

async function getPartnerShopId(token: string): Promise<{ shopId: string; userId: string } | { error: string; status: number }> {
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
  return { shopId, userId };
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

export default async function handler(
  req: {
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    query?: { limit?: string; offset?: string; startDate?: string; finishDate?: string };
    body?: {
      value?: number;
      pixAddressKey?: string;
      pixAddressKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
      bankAccount?: {
        ownerName?: string;
        cpfCnpj?: string;
        agency?: string;
        account?: string;
        accountDigit?: string;
        bank?: { code?: string };
        bankAccountType?: 'CONTA_CORRENTE' | 'CONTA_POUPANCA';
      };
      operationType?: 'PIX' | 'TED';
      description?: string;
    };
  },
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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use GET ou POST.' });
  }

  const authRaw = req.headers?.authorization;
  const authHeader = typeof authRaw === 'string' ? authRaw : Array.isArray(authRaw) ? authRaw[0] : '';
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não enviado. Faça login novamente.' });
  }

  const partner = await getPartnerShopId(token);
  if ('error' in partner) {
    return res.status(partner.status).json({ success: false, error: partner.error });
  }
  const { shopId, userId } = partner;
  const clientMeta = getClientMeta(req);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Configuração do servidor indisponível.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id, asaas_api_key, asaas_account_id')
    .eq('id', shopId)
    .single();

  if (shopError || !shop) {
    return res.status(404).json({ success: false, error: 'Loja não encontrada.' });
  }

  const subAccountKey = (shop as { asaas_api_key?: string }).asaas_api_key?.trim() || null;
  if (!subAccountKey) {
    return res.status(400).json({
      success: false,
      error: 'Sua loja ainda não tem conta de pagamentos configurada para saque. Configure os documentos e a chave da subconta.',
    });
  }

  const baseUrl = ASAAS_API_URL.startsWith('http') ? ASAAS_API_URL : `https://${ASAAS_API_URL}`;
  const apiHeaders: Record<string, string> = { access_token: subAccountKey };

  // Garantir que a chave usada é da SUBCONTA da loja, não da conta principal Asaas
  const expectedSubAccountId = (shop as { asaas_account_id?: string }).asaas_account_id?.trim() || null;
  if (expectedSubAccountId) {
    try {
      const meRes = await fetch(`${baseUrl}/myAccount/status`, { headers: apiHeaders });
      if (meRes.ok) {
        const meData = (await meRes.json()) as { id?: string };
        const keyAccountId = (meData?.id ?? '').trim().toLowerCase();
        const expectedId = expectedSubAccountId.trim().toLowerCase();
        if (keyAccountId && expectedId && keyAccountId !== expectedId) {
          return res.status(400).json({
            success: false,
            error: 'A chave de API configurada para esta loja pertence à conta principal do Asaas, não à subconta da barbearia. No painel admin, atualize a "Chave API" do parceiro com a chave da subconta (Documentos > gerar chave da subconta no Asaas).',
          });
        }
      }
    } catch (e) {
      console.error('[api/partner/wallet] myAccount/status check', e);
    }
  }

  if (req.method === 'GET') {
    try {
      const balanceRes = await fetch(`${baseUrl}/finance/balance`, { headers: apiHeaders });
      if (!balanceRes.ok) {
        const errBody = await balanceRes.text();
        console.error('[api/partner/wallet] balance', balanceRes.status, errBody);
        return res.status(balanceRes.status).json({
          success: false,
          error: 'Não foi possível consultar o saldo. Tente mais tarde.',
        });
      }
      const balanceData = (await balanceRes.json()) as { balance?: number };
      const balance = typeof balanceData.balance === 'number' ? balanceData.balance : 0;

      const limit = Math.min(100, Math.max(1, parseInt(String(req.query?.limit), 10) || 20));
      const offset = Math.max(0, parseInt(String(req.query?.offset), 10) || 0);
      const finishDate = req.query?.finishDate || new Date().toISOString().slice(0, 10);
      const startDate = req.query?.startDate || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 10);
      })();

      const txRes = await fetch(
        `${baseUrl}/financialTransactions?startDate=${startDate}&finishDate=${finishDate}&offset=${offset}&limit=${limit}&order=desc`,
        { headers: apiHeaders }
      );
      let transactions: Array<{ id: string; value: number; balance?: number; type: string; date: string; description?: string }> = [];
      if (txRes.ok) {
        const txData = (await txRes.json()) as {
          data?: Array<{ id?: string; value?: number; balance?: number; type?: string; date?: string; description?: string }>;
        };
        const list = txData?.data ?? [];
        transactions = list.map((t) => ({
          id: String(t.id ?? ''),
          value: Number(t.value ?? 0),
          balance: t.balance != null ? Number(t.balance) : undefined,
          type: String(t.type ?? ''),
          date: String(t.date ?? ''),
          description: t.description != null ? String(t.description) : undefined,
        }));
      }

      return res.status(200).json({
        success: true,
        balance,
        transactions,
      });
    } catch (e) {
      console.error('[api/partner/wallet] GET', e);
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao consultar saldo e histórico.',
      });
    }
  }

  // POST: criar transferência (saque)
  const body = req.body ?? {};
  const value = typeof body.value === 'number' ? body.value : Number(body.value);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ success: false, error: 'Informe um valor válido para o saque.' });
  }

  const hasPix = body.pixAddressKey && body.pixAddressKeyType;
  const hasBank = body.bankAccount && body.bankAccount.ownerName && body.bankAccount.cpfCnpj && body.bankAccount.agency && body.bankAccount.account && body.bankAccount.accountDigit;
  if (!hasPix && !hasBank) {
    return res.status(400).json({
      success: false,
      error: 'Informe a chave PIX (pixAddressKey e pixAddressKeyType) ou os dados da conta bancária.',
    });
  }

  const payload: Record<string, unknown> = {
    value: Math.round(value * 100) / 100,
    operationType: body.operationType || 'PIX',
  };
  if (body.description) payload.description = body.description;
  if (hasPix) {
    payload.pixAddressKey = String(body.pixAddressKey).trim();
    payload.pixAddressKeyType = body.pixAddressKeyType;
  }
  if (hasBank && body.bankAccount) {
    payload.bankAccount = {
      ownerName: body.bankAccount.ownerName,
      cpfCnpj: String(body.bankAccount.cpfCnpj).replace(/\D/g, ''),
      agency: String(body.bankAccount.agency).replace(/\D/g, ''),
      account: String(body.bankAccount.account).replace(/\D/g, ''),
      accountDigit: String(body.bankAccount.accountDigit ?? '').replace(/\D/g, '') || undefined,
      bank: body.bankAccount.bank?.code ? { code: String(body.bankAccount.bank.code) } : undefined,
      bankAccountType: body.bankAccount.bankAccountType || 'CONTA_CORRENTE',
    };
  }

  try {
    const transferRes = await fetch(`${baseUrl}/transfers`, {
      method: 'POST',
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const transferData = (await transferRes.json()) as {
      id?: string;
      value?: number;
      status?: string;
      type?: string;
      dateCreated?: string;
      errors?: Array<{ code?: string; description?: string }>;
    };
    if (!transferRes.ok) {
      const msg = transferData?.errors?.[0]?.description || transferData?.errors?.[0]?.code || 'Erro ao solicitar saque.';
      await insertFinancialAudit(supabase, {
        shop_id: shopId,
        actor_user_id: userId,
        action: 'WALLET_TRANSFER',
        amount: payload.value as number,
        result: 'failure',
        error_message: msg,
        metadata: { operationType: payload.operationType },
        ip: clientMeta.ip,
        user_agent: clientMeta.userAgent,
      });
      return res.status(transferRes.status).json({ success: false, error: msg });
    }
    await insertFinancialAudit(supabase, {
      shop_id: shopId,
      actor_user_id: userId,
      action: 'WALLET_TRANSFER',
      amount: transferData.value ?? (payload.value as number),
      result: 'success',
      asaas_transfer_id: transferData.id != null ? String(transferData.id) : null,
      metadata: { status: transferData.status, type: transferData.type, operationType: payload.operationType },
      ip: clientMeta.ip,
      user_agent: clientMeta.userAgent,
    });
    return res.status(200).json({
      success: true,
      transfer: {
        id: transferData.id,
        value: transferData.value,
        status: transferData.status,
        type: transferData.type,
        dateCreated: transferData.dateCreated,
      },
    });
  } catch (e) {
    console.error('[api/partner/wallet] POST', e);
    const errMsg = e instanceof Error ? e.message : 'Erro ao solicitar saque. Tente novamente.';
    await insertFinancialAudit(supabase, {
      shop_id: shopId,
      actor_user_id: userId,
      action: 'WALLET_TRANSFER',
      amount: value,
      result: 'failure',
      error_message: errMsg,
      ip: clientMeta.ip,
      user_agent: clientMeta.userAgent,
    });
    return res.status(500).json({
      success: false,
      error: errMsg,
    });
  }
}
