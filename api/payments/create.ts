// Vercel Serverless: POST /api/payments/create — cria cobrança Asaas com split para a loja

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_API_URL = (process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3').replace(/\/$/, '');

interface CreatePaymentBody {
  amount: number;
  tip?: number;
  shopWalletId: string;
  splitPercent?: number;
  description: string;
  customerName: string;
  customerEmail: string;
}

export default async function handler(
  req: { method?: string; body?: CreatePaymentBody },
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (o: object) => void; end: () => void }; end?: (code?: number) => void }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  if (!ASAAS_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'Configuração do gateway de pagamento indisponível (ASAAS_API_KEY).',
    });
  }

  try {
    const body = req.body as CreatePaymentBody | undefined;
    const { amount, shopWalletId, splitPercent: bodySplitPercent, description, customerName, customerEmail, tip = 0 } = body || {};

    if (!amount || amount <= 0 || !shopWalletId || !customerName || !customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: amount, shopWalletId, customerName, customerEmail.',
      });
    }

    const totalValue = Number(amount) + Number(tip);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    // 1) Criar cliente no Asaas (pagador)
    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name: String(customerName),
        email: String(customerEmail),
        mobilePhone: '11999999999',
        cpfCnpj: '00000000000',
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
      } catch (_) {}
      const msg = parsed?.errors?.[0]?.description || errText || 'Erro ao criar cliente no gateway.';
      return res.status(400).json({ success: false, error: msg });
    }

    if (!customerId) {
      return res.status(500).json({
        success: false,
        error: 'Gateway não retornou ID do cliente.',
      });
    }

    // 2) Criar cobrança com split para a carteira da loja
    const rawSplit = bodySplitPercent != null ? Number(bodySplitPercent) : 95;
    const splitToShop = Math.min(100, Math.max(0, rawSplit));
    const paymentPayload = {
      customer: customerId,
      billingType: 'PIX' as const,
      value: totalValue,
      dueDate: dueDateStr,
      description: (description || '').slice(0, 500),
      split: [
        {
          walletId: String(shopWalletId),
          percentualValue: splitToShop,
        },
      ],
    };

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
      } catch (_) {}
      return res.status(400).json({ success: false, error: errMsg });
    }

    let paymentData: Record<string, unknown> = {};
    try {
      paymentData = JSON.parse(paymentText);
    } catch (_) {
      return res.status(500).json({
        success: false,
        error: 'Resposta inválida do gateway de pagamento.',
      });
    }

    return res.status(200).json({
      success: true,
      payment: paymentData,
      invoiceUrl: (paymentData as { invoiceUrl?: string }).invoiceUrl,
      id: (paymentData as { id?: string }).id,
    });
  } catch (e) {
    console.error('[api/payments/create]', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Erro ao processar pagamento com Split Asaas.',
    });
  }
}
