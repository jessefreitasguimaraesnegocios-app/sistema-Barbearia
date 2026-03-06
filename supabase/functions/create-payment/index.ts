// Supabase Edge Function: create-payment
// Cria cobrança Asaas (PIX) com split para a carteira da loja

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Método não permitido. Use POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  if (!asaasApiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Configuração do gateway de pagamento indisponível (ASAAS_API_KEY).",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const asaasBaseUrl = (
    Deno.env.get("ASAAS_API_URL") || "https://sandbox.asaas.com/api/v3"
  ).replace(/\/$/, "");

  try {
    const body = await req.json();
    const {
      amount,
      tip = 0,
      shopWalletId,
      description = "",
      customerName,
      customerEmail,
    } = body || {};

    if (!amount || amount <= 0 || !shopWalletId || !customerName || !customerEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Campos obrigatórios: amount, shopWalletId, customerName, customerEmail.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const totalValue = Number(amount) + Number(tip);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    // 1) Criar cliente no Asaas (pagador)
    const customerRes = await fetch(`${asaasBaseUrl}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaasApiKey,
      },
      body: JSON.stringify({
        name: String(customerName),
        email: String(customerEmail),
        mobilePhone: "11999999999",
        cpfCnpj: "00000000000",
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
      const msg =
        parsed?.errors?.[0]?.description ||
        errText ||
        "Erro ao criar cliente no gateway.";
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gateway não retornou ID do cliente.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2) Criar cobrança com split para a carteira da loja
    const splitToShop = Math.min(100, Math.max(0, 95));
    const paymentPayload = {
      customer: customerId,
      billingType: "PIX",
      value: totalValue,
      dueDate: dueDateStr,
      description: String(description).slice(0, 500),
      split: [
        {
          walletId: String(shopWalletId),
          percentualValue: splitToShop,
        },
      ],
    };

    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaasApiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentText = await paymentRes.text();
    if (!paymentRes.ok) {
      let errMsg = paymentText;
      try {
        const errJson = JSON.parse(paymentText);
        errMsg =
          errJson?.errors?.[0]?.description || errJson?.error || paymentText;
      } catch (_) {}
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let paymentData: Record<string, unknown> = {};
    try {
      paymentData = JSON.parse(paymentText);
    } catch (_) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Resposta inválida do gateway de pagamento.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: paymentData,
        invoiceUrl: paymentData.invoiceUrl,
        id: paymentData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[create-payment]", e);
    return new Response(
      JSON.stringify({
        success: false,
        error:
          e instanceof Error ? e.message : "Erro ao processar pagamento com Split Asaas.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
