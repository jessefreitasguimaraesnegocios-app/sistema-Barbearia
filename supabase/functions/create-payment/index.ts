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
    Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3"
  ).replace(/\/$/, "");

  try {
    const body = await req.json();
    const {
      amount,
      tip = 0,
      shopWalletId,
      splitPercent: bodySplitPercent,
      description = "",
      customerName,
      customerEmail,
      customerCpfCnpj: bodyCpfCnpj,
      customerPhone: bodyPhone,
    } = body || {};

    if (!amount || amount <= 0 || !customerName || !customerEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Campos obrigatórios: amount, customerName, customerEmail.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const effectiveWalletId =
      shopWalletId && String(shopWalletId).trim() !== "" && String(shopWalletId) !== "default_wallet_id"
        ? String(shopWalletId).trim()
        : (Deno.env.get("ASAAS_WALLET_ID") || "").trim();
    if (!effectiveWalletId) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Nenhuma carteira configurada para a loja. Configure ASAAS_WALLET_ID nos Secrets do Supabase ou cadastre a loja com wallet (criação de subconta).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cpfCnpjDigits = (bodyCpfCnpj != null && String(bodyCpfCnpj).trim() !== "")
      ? String(bodyCpfCnpj).replace(/\D/g, "")
      : "";
    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "CPF/CNPJ obrigatório. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const mobilePhone = (bodyPhone != null && String(bodyPhone).trim() !== "")
      ? String(bodyPhone).replace(/\D/g, "").slice(0, 11) || "11999999999"
      : "11999999999";

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
        mobilePhone: mobilePhone.length >= 10 ? mobilePhone : "11999999999",
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
    const rawSplit = bodySplitPercent != null ? Number(bodySplitPercent) : 95;
    const splitToShop = Math.min(100, Math.max(0, rawSplit));
    const paymentPayload = {
      customer: customerId,
      billingType: "PIX",
      value: totalValue,
      dueDate: dueDateStr,
      description: String(description).slice(0, 500),
      split: [
        {
          walletId: effectiveWalletId,
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
