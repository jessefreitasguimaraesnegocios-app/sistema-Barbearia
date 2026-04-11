// Vercel Serverless: POST /api/payments/create
// Mesmo contrato da Edge Function create-payment: wallet/split resolvidos por shopId (booking/order); shopWalletId não é mais obrigatório

import { createClient } from '@supabase/supabase-js';
import { resolveShopSplitPercent, resolveSplitPercentForRuntime } from '../../lib/payments/resolve-shop-split';
import { validateOrderLineItemsStock } from '../../lib/validateOrderStock';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
type RuntimeMode = 'production' | 'sandbox';
function resolveWalletByMode(mode: RuntimeMode, row: Record<string, unknown>): string {
  const modeWallet =
    mode === 'sandbox'
      ? row.asaas_wallet_id_sandbox
      : row.asaas_wallet_id_prod;
  const normalizedMode =
    modeWallet != null && String(modeWallet).trim() !== ''
      ? String(modeWallet).trim()
      : '';
  if (normalizedMode) return normalizedMode;
  const legacy = row.asaas_wallet_id;
  return legacy != null && String(legacy).trim() !== '' ? String(legacy).trim() : '';
}

async function resolveAsaasRuntimeConfig(
  supabase: { from: (table: string) => unknown }
): Promise<{ mode: RuntimeMode; apiKey: string; apiUrl: string }> {
  let mode: RuntimeMode = 'production';
  const runtimeSelect = supabase.from('platform_runtime_settings') as {
    select: (fields: string) => {
      eq: (column: string, value: unknown) => { maybeSingle: () => Promise<{ data: { asaas_mode?: string } | null }> };
    };
  };
  const { data } = await runtimeSelect
    .select('asaas_mode')
    .eq('singleton_id', true)
    .maybeSingle();
  if (data?.asaas_mode === 'sandbox') mode = 'sandbox';

  const defaultApiUrl = 'https://api.asaas.com/v3';
  if (mode === 'sandbox') {
    return {
      mode,
      apiKey: process.env.ASAAS_API_KEY_SANDBOX || process.env.ASAAS_API_KEY || '',
      apiUrl: (process.env.ASAAS_API_URL_SANDBOX || process.env.ASAAS_API_URL || defaultApiUrl).replace(/\/$/, ''),
    };
  }
  return {
    mode,
    apiKey: process.env.ASAAS_API_KEY || '',
    apiUrl: (process.env.ASAAS_API_URL || defaultApiUrl).replace(/\/$/, ''),
  };
}

function normalizeAsaasMobilePhone(rawPhone: unknown): string {
  const fallback = '31999999999';
  if (rawPhone == null) return fallback;

  let digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return fallback;

  // Usuário pode informar número com DDI (+55). Para o Asaas, enviamos só DDD + número.
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  // Caso venha 10 dígitos (DDD + 8), tenta adaptar para celular adicionando 9.
  if (digits.length === 10) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  // Celular BR esperado: DDD(2) + 9 + 8 dígitos.
  if (!/^\d{2}9\d{8}$/.test(digits)) {
    return fallback;
  }

  return digits;
}

interface CreatePaymentBody {
  amount: number;
  tip?: number;
  idempotencyKey?: string;
  description?: string;
  customerName: string;
  customerEmail: string;
  customerCpfCnpj?: string;
  customerPhone?: string;
  recordType?: 'booking' | 'order';
  booking?: { shopId: string; clientId: string; serviceId: string; professionalId: string; date: string; time: string; amount: number; tip?: number };
  order?: { shopId: string; clientId: string; items: Array<{ productId: string; quantity: number; price: number }>; total: number };
}

export default async function handler(
  req: { method?: string; body?: CreatePaymentBody; headers?: Record<string, string | string[] | undefined> },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Configuração do Supabase indisponível (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  try {
    const rawAuth = req.headers?.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, error: 'Não autorizado: token ausente.' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUserId = authData?.user?.id;
    if (authErr || !authUserId) {
      return res.status(401).json({ success: false, error: 'Não autorizado: token inválido.' });
    }

    const asaasRuntime = await resolveAsaasRuntimeConfig(supabase);
    const runtimeMode = asaasRuntime.mode;
    const ASAAS_API_KEY = asaasRuntime.apiKey;
    const ASAAS_API_URL = asaasRuntime.apiUrl;
    if (!ASAAS_API_KEY) {
      return res.status(500).json({
        success: false,
        error: `Configuração do gateway de pagamento indisponível (ASAAS_API_KEY em ${asaasRuntime.mode}).`,
      });
    }

    const body = (req.body || {}) as CreatePaymentBody;
    const {
      amount,
      tip = 0,
      idempotencyKey: bodyIdempotencyKey,
      description = '',
      customerName,
      customerEmail,
      customerCpfCnpj: bodyCpfCnpj,
      customerPhone: bodyPhone,
      recordType,
      booking: bodyBooking,
      order: bodyOrder,
    } = body;
    const idempotencyKey = bodyIdempotencyKey != null ? String(bodyIdempotencyKey).trim() : '';
    if (recordType === 'booking' && bodyBooking?.clientId && bodyBooking.clientId !== authUserId) {
      return res.status(403).json({ success: false, error: 'Não autorizado para criar pagamento deste cliente.' });
    }
    if (recordType === 'order' && bodyOrder?.clientId && bodyOrder.clientId !== authUserId) {
      return res.status(403).json({ success: false, error: 'Não autorizado para criar pagamento deste cliente.' });
    }

    const rateShopId = bodyBooking?.shopId || bodyOrder?.shopId || 'no-shop';
    const { data: allowedByRateLimit, error: rateErr } = await supabase.rpc('security_check_rate_limit', {
      p_route: 'create-payment',
      p_subject: `create-payment:${authUserId}:${rateShopId}`,
      p_limit: 12,
      p_window_seconds: 60,
    });
    if (rateErr) {
      return res.status(500).json({ success: false, error: `Falha no rate limit: ${rateErr.message}` });
    }
    if (allowedByRateLimit === false) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas de pagamento. Aguarde 1 minuto e tente novamente.',
      });
    }

    if (!amount || amount <= 0 || !customerName || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: amount, customerName, customerEmail.',
      });
    }
    if (idempotencyKey.length > 190) {
      return res.status(400).json({ success: false, error: 'idempotencyKey inválido (máximo 190 caracteres).' });
    }

    const shopId = bodyBooking?.shopId || bodyOrder?.shopId;
    let effectiveWalletId = '';
    let splitToShop = 95;
    let shopSplitResolved = 95;
    let hasShopWallet = false;
    let hasProfessionalWallet = false;

    if (shopId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const { data: shop, error: shopErr } = await supabase
        .from('shops')
        .select('asaas_wallet_id, asaas_wallet_id_prod, asaas_wallet_id_sandbox, split_percent, split_percent_sandbox')
        .eq('id', shopId)
        .single();
      if (!shopErr && shop) {
        const shopWallet = resolveWalletByMode(runtimeMode, shop as unknown as Record<string, unknown>);
        if (shopWallet) {
          effectiveWalletId = shopWallet;
          hasShopWallet = true;
        }
        shopSplitResolved = resolveShopSplitPercent(runtimeMode, shop as Record<string, unknown>);
        splitToShop = shopSplitResolved;
      }
      if (recordType === 'booking' && bodyBooking?.professionalId) {
        const { data: professional } = await supabase
          .from('professionals')
          .select('asaas_wallet_id, asaas_wallet_id_prod, asaas_wallet_id_sandbox, split_percent, split_percent_sandbox')
          .eq('id', bodyBooking.professionalId)
          .eq('shop_id', shopId)
          .maybeSingle();
        const professionalWallet = professional
          ? resolveWalletByMode(runtimeMode, professional as unknown as Record<string, unknown>)
          : '';
        if (professionalWallet) {
          effectiveWalletId = professionalWallet;
          hasProfessionalWallet = true;
          splitToShop = resolveSplitPercentForRuntime(
            runtimeMode,
            professional as Record<string, unknown>,
            shopSplitResolved
          );
        }
      }
      if (recordType === 'order' && !hasShopWallet) {
        return res.status(400).json({
          success: false,
          error:
            'Esta loja ainda não possui carteira Asaas configurada. Não é possível processar pagamento com split. Entre em contato com o suporte.',
        });
      }
      if (recordType === 'booking' && !hasProfessionalWallet && !hasShopWallet) {
        return res.status(400).json({
          success: false,
          error:
            'Este profissional e esta loja ainda não possuem carteira Asaas configurada. Não é possível processar pagamento com split.',
        });
      }
    } else if (shopId && (recordType === 'booking' || recordType === 'order')) {
      return res.status(400).json({
        success: false,
        error:
          'Esta loja ainda não possui carteira Asaas configurada. Não é possível processar pagamento com split. Entre em contato com o suporte.',
      });
    }

    if (recordType === 'order' && !effectiveWalletId) {
      return res.status(400).json({
        success: false,
        error:
          'Esta loja ainda não possui carteira Asaas configurada. Não é possível processar pagamento com split. Entre em contato com o suporte.',
      });
    }
    if ((recordType === 'booking' || recordType === 'order') && !idempotencyKey) {
      return res.status(400).json({ success: false, error: 'idempotencyKey é obrigatório para agendamento/pedido.' });
    }

    if (recordType === 'booking' && bodyBooking?.clientId && bodyBooking?.shopId && idempotencyKey) {
      const { data: existing } = await supabase
        .from('appointments')
        .select('id, asaas_payment_id')
        .eq('client_id', bodyBooking.clientId)
        .eq('shop_id', bodyBooking.shopId)
        .eq('payment_idempotency_key', idempotencyKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.asaas_payment_id) {
        const paymentGetRes = await fetch(`${ASAAS_API_URL}/payments/${existing.asaas_payment_id}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
        });
        let existingPaymentData: Record<string, unknown> = {};
        if (paymentGetRes.ok) {
          const txt = await paymentGetRes.text();
          try {
            existingPaymentData = JSON.parse(txt);
          } catch {
            /* ignore invalid JSON */
          }
        }
        return res.status(200).json({
          success: true,
          duplicate: true,
          payment: existingPaymentData,
          invoiceUrl: (existingPaymentData as { invoiceUrl?: string }).invoiceUrl,
          id: (existingPaymentData as { id?: string }).id ?? existing.asaas_payment_id,
          appointmentId: existing.id,
        });
      }
    }

    if (recordType === 'order' && bodyOrder?.clientId && bodyOrder?.shopId && idempotencyKey) {
      const { data: existing } = await supabase
        .from('orders')
        .select('id, asaas_payment_id')
        .eq('client_id', bodyOrder.clientId)
        .eq('shop_id', bodyOrder.shopId)
        .eq('payment_idempotency_key', idempotencyKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.asaas_payment_id) {
        const paymentGetRes = await fetch(`${ASAAS_API_URL}/payments/${existing.asaas_payment_id}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', access_token: ASAAS_API_KEY },
        });
        let existingPaymentData: Record<string, unknown> = {};
        if (paymentGetRes.ok) {
          const txt = await paymentGetRes.text();
          try {
            existingPaymentData = JSON.parse(txt);
          } catch {
            /* ignore invalid JSON */
          }
        }
        return res.status(200).json({
          success: true,
          duplicate: true,
          payment: existingPaymentData,
          invoiceUrl: (existingPaymentData as { invoiceUrl?: string }).invoiceUrl,
          id: (existingPaymentData as { id?: string }).id ?? existing.asaas_payment_id,
          orderId: existing.id,
        });
      }
    }

    if (recordType === 'order' && bodyOrder?.shopId && Array.isArray(bodyOrder.items)) {
      const stockCheck = await validateOrderLineItemsStock(
        supabase,
        String(bodyOrder.shopId),
        bodyOrder.items as Array<{ productId: string; quantity: number }>
      );
      if (stockCheck.ok === false) {
        return res.status(stockCheck.status).json({ success: false, error: stockCheck.error });
      }
    }

    const cpfCnpjDigits =
      bodyCpfCnpj != null && String(bodyCpfCnpj).trim() !== ''
        ? String(bodyCpfCnpj).replace(/\D/g, '')
        : '';
    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      return res.status(400).json({
        success: false,
        error: 'CPF/CNPJ obrigatório. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
      });
    }

    const mobilePhone = normalizeAsaasMobilePhone(bodyPhone);

    const totalValue = Number(amount) + Number(tip);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name: String(customerName),
        email: String(customerEmail),
        mobilePhone,
        cpfCnpj: cpfCnpjDigits,
      }),
    });

    let customerId: string;
    if (customerRes.ok) {
      const customerData = await customerRes.json();
      customerId = customerData?.id;
    } else {
      const errText = await customerRes.text();
      let parsed: { errors?: Array<{ description?: string }> } = {};
      try {
        parsed = JSON.parse(errText);
      } catch {
        /* ignore */
      }
      const msg = parsed?.errors?.[0]?.description || errText || 'Erro ao criar cliente no gateway.';
      return res.status(400).json({ success: false, error: msg });
    }

    if (!customerId) {
      return res.status(500).json({
        success: false,
        error: 'Gateway não retornou ID do cliente.',
      });
    }

    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: 'PIX' as const,
      value: totalValue,
      dueDate: dueDateStr,
      description: String(description).slice(0, 500),
    };
    if ((recordType === 'booking' || recordType === 'order') && idempotencyKey) {
      paymentPayload.externalReference = `${recordType}:${idempotencyKey}`;
    }
    if (effectiveWalletId) {
      paymentPayload.split = [
        {
          walletId: effectiveWalletId,
          percentualValue: splitToShop,
        },
      ];
    }

    const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentText = await paymentRes.text();
    if (!paymentRes.ok) {
      let errMsg = paymentText;
      try {
        const errJson = JSON.parse(paymentText);
        errMsg = errJson?.errors?.[0]?.description || errJson?.error || paymentText;
      } catch {
        /* keep errMsg as paymentText */
      }
      return res.status(400).json({ success: false, error: errMsg });
    }

    let paymentData: Record<string, unknown> = {};
    try {
      paymentData = JSON.parse(paymentText);
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Resposta inválida do gateway de pagamento.',
      });
    }

    const asaasPaymentId = paymentData.id as string | undefined;
    let recordId: string | null = null;

    if (asaasPaymentId && (recordType === 'booking' || recordType === 'order') && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      if (recordType === 'booking' && bodyBooking && typeof bodyBooking === 'object') {
        const b = bodyBooking;
        if (b.shopId && b.clientId && b.serviceId && b.professionalId && b.date && b.time != null && b.amount != null) {
          const { data: apt, error: aptErr } = await supabase
            .from('appointments')
            .insert({
              client_id: b.clientId,
              shop_id: b.shopId,
              service_id: b.serviceId,
              professional_id: b.professionalId,
              date: b.date,
              time: b.time,
              amount: Number(b.amount),
              status: 'PENDING',
              asaas_payment_id: asaasPaymentId,
              payment_idempotency_key: idempotencyKey || null,
            })
            .select('id')
            .single();
          if (aptErr || !apt?.id) {
            return res.status(500).json({
              success: false,
              error: 'Cobrança criada, mas falhou ao registrar o agendamento pendente.',
              paymentId: asaasPaymentId,
            });
          }
          recordId = apt.id;
        }
      } else if (recordType === 'order' && bodyOrder && typeof bodyOrder === 'object') {
        const o = bodyOrder;
        if (o.shopId && o.clientId && Array.isArray(o.items) && o.total != null) {
          const { data: ord, error: ordErr } = await supabase
            .from('orders')
            .insert({
              client_id: o.clientId,
              shop_id: o.shopId,
              items: o.items,
              total: Number(o.total),
              status: 'PENDING',
              asaas_payment_id: asaasPaymentId,
              payment_idempotency_key: idempotencyKey || null,
            })
            .select('id')
            .single();
          if (ordErr || !ord?.id) {
            return res.status(500).json({
              success: false,
              error: 'Cobrança criada, mas falhou ao registrar o pedido pendente.',
              paymentId: asaasPaymentId,
            });
          }
          recordId = ord.id;
        }
      }
    }

    return res.status(200).json({
      success: true,
      payment: paymentData,
      invoiceUrl: (paymentData as { invoiceUrl?: string }).invoiceUrl,
      id: (paymentData as { id?: string }).id,
      appointmentId: recordType === 'booking' ? recordId : undefined,
      orderId: recordType === 'order' ? recordId : undefined,
    });
  } catch (e) {
    console.error('[api/payments/create]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao processar pagamento com Split Asaas.',
    });
  }
}
