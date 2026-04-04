// Supabase Edge Function: create-payment
// Cria cobrança Asaas (PIX) com split para a carteira da loja e opcionalmente grava agendamento/pedido PENDING no Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizeAsaasMobilePhone(rawPhone: unknown): string {
  const fallback = "11999999999";
  if (rawPhone == null) return fallback;

  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return fallback;

  // Usuário pode informar número com DDI (+55). Para o Asaas, enviamos só DDD + número.
  if (digits.startsWith("55") && digits.length > 11) {
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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Configuração do Supabase indisponível (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
  if (!supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Configuração do Supabase indisponível (SUPABASE_ANON_KEY na Edge Function).",
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
    const authHeader = (req.headers.get("Authorization") || req.headers.get("authorization") || "").trim();
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado: envie Authorization: Bearer <access_token>." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /** Valida JWT com GoTrue (anon + Bearer), mais estável que service role auth.getUser(jwt) no Edge. */
    const bearer = authHeader.startsWith("Bearer ") ? authHeader : `Bearer ${token}`;
    const authVerify = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      method: "GET",
      headers: { Authorization: bearer, apikey: supabaseAnonKey },
    });
    if (!authVerify.ok) {
      console.error("[create-payment] auth/v1/user", authVerify.status, await authVerify.text().catch(() => ""));
      return new Response(
        JSON.stringify({
          success: false,
          error: "Não autorizado: sessão inválida ou expirada. Faça login novamente.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authJson = (await authVerify.json()) as { user?: { id?: string }; id?: string };
    const authUserId = authJson?.user?.id ?? authJson?.id;
    if (!authUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado: token sem usuário." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const {
      amount,
      tip = 0,
      splitPercent: bodySplitPercent,
      idempotencyKey: bodyIdempotencyKey,
      description = "",
      customerName,
      customerEmail,
      customerCpfCnpj: bodyCpfCnpj,
      customerPhone: bodyPhone,
      recordType,
      booking: bodyBooking,
      order: bodyOrder,
    } = body || {};
    const idempotencyKey = bodyIdempotencyKey != null ? String(bodyIdempotencyKey).trim() : "";

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
    if (idempotencyKey.length > 190) {
      return new Response(
        JSON.stringify({ success: false, error: "idempotencyKey inválido (máximo 190 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopId = bodyBooking?.shopId || bodyOrder?.shopId;
    if ((recordType === "booking" || recordType === "order") && !shopId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Agendamento e pedido exigem shopId (loja).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    let effectiveWalletId = "";
    let splitToShop = Math.min(100, Math.max(0, bodySplitPercent != null ? Number(bodySplitPercent) : 95));
    let hasShopWallet = false;
    let hasProfessionalWallet = false;

    if (recordType === "booking" && bodyBooking?.clientId && bodyBooking.clientId !== authUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado para criar pagamento deste cliente." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (recordType === "order" && bodyOrder?.clientId && bodyOrder.clientId !== authUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado para criar pagamento deste cliente." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rateShopId = bodyBooking?.shopId || bodyOrder?.shopId || "no-shop";
    const { data: allowedByRateLimit, error: rateErr } = await supabaseAdmin.rpc("security_check_rate_limit", {
      p_route: "create-payment",
      p_subject: `create-payment:${authUserId}:${rateShopId}`,
      p_limit: 12,
      p_window_seconds: 60,
    });
    if (rateErr) {
      return new Response(
        JSON.stringify({ success: false, error: `Falha no rate limit: ${rateErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (allowedByRateLimit === false) {
      return new Response(
        JSON.stringify({ success: false, error: "Muitas tentativas de pagamento. Aguarde 1 minuto e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (shopId) {
      const { data: shop, error: shopErr } = await supabaseAdmin
        .from("shops")
        .select("asaas_wallet_id, split_percent")
        .eq("id", shopId)
        .single();
      if (!shopErr && shop) {
        const shopWallet = (shop.asaas_wallet_id != null && String(shop.asaas_wallet_id).trim() !== "")
          ? String(shop.asaas_wallet_id).trim()
          : "";
        if (shopWallet) {
          effectiveWalletId = shopWallet;
          hasShopWallet = true;
        }
        if (shop.split_percent != null) {
          const pct = Number(shop.split_percent);
          if (!Number.isNaN(pct)) splitToShop = Math.min(100, Math.max(0, pct));
        }
      }

      if (recordType === "booking" && bodyBooking?.professionalId) {
        const { data: professional } = await supabaseAdmin
          .from("professionals")
          .select("asaas_wallet_id, split_percent")
          .eq("id", bodyBooking.professionalId)
          .eq("shop_id", shopId)
          .maybeSingle();
        const professionalWallet = (
          professional?.asaas_wallet_id != null && String(professional.asaas_wallet_id).trim() !== ""
        )
          ? String(professional.asaas_wallet_id).trim()
          : "";
        if (professionalWallet) {
          effectiveWalletId = professionalWallet;
          hasProfessionalWallet = true;
        }
        if (professional?.split_percent != null) {
          const pct = Number(professional.split_percent);
          if (!Number.isNaN(pct)) splitToShop = Math.min(100, Math.max(0, pct));
        }
      }

      // Pedido exige carteira da loja. Serviço aceita fallback para carteira da loja.
      if (recordType === "order" && !hasShopWallet) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Esta loja ainda não possui carteira Asaas configurada. Não é possível processar pagamento com split. Entre em contato com o suporte.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (recordType === "booking" && !hasProfessionalWallet && !hasShopWallet) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Este profissional e esta loja ainda não possuem carteira Asaas configurada. Não é possível processar pagamento com split.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if ((recordType === "booking" || recordType === "order") && !idempotencyKey) {
      return new Response(
        JSON.stringify({ success: false, error: "idempotencyKey é obrigatório para agendamento/pedido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (recordType === "booking" && bodyBooking?.clientId && bodyBooking?.shopId && idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id, asaas_payment_id")
        .eq("client_id", bodyBooking.clientId)
        .eq("shop_id", bodyBooking.shopId)
        .eq("payment_idempotency_key", idempotencyKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.asaas_payment_id) {
        const paymentGetRes = await fetch(`${asaasBaseUrl}/payments/${existing.asaas_payment_id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        });
        let existingPaymentData: Record<string, unknown> = {};
        if (paymentGetRes.ok) {
          const txt = await paymentGetRes.text();
          try { existingPaymentData = JSON.parse(txt); } catch (_) {}
        }
        return new Response(
          JSON.stringify({
            success: true,
            duplicate: true,
            payment: existingPaymentData,
            invoiceUrl: existingPaymentData.invoiceUrl,
            id: existingPaymentData.id ?? existing.asaas_payment_id,
            appointmentId: existing.id,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (recordType === "order" && bodyOrder?.clientId && bodyOrder?.shopId && idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("orders")
        .select("id, asaas_payment_id")
        .eq("client_id", bodyOrder.clientId)
        .eq("shop_id", bodyOrder.shopId)
        .eq("payment_idempotency_key", idempotencyKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.asaas_payment_id) {
        const paymentGetRes = await fetch(`${asaasBaseUrl}/payments/${existing.asaas_payment_id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        });
        let existingPaymentData: Record<string, unknown> = {};
        if (paymentGetRes.ok) {
          const txt = await paymentGetRes.text();
          try { existingPaymentData = JSON.parse(txt); } catch (_) {}
        }
        return new Response(
          JSON.stringify({
            success: true,
            duplicate: true,
            payment: existingPaymentData,
            invoiceUrl: existingPaymentData.invoiceUrl,
            id: existingPaymentData.id ?? existing.asaas_payment_id,
            orderId: existing.id,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    const mobilePhone = normalizeAsaasMobilePhone(bodyPhone);

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

    // 2) Criar cobrança; split só quando a loja tem carteira (nunca split para própria carteira)
    const paymentPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: "PIX",
      value: totalValue,
      dueDate: dueDateStr,
      description: String(description).slice(0, 500),
    };
    if ((recordType === "booking" || recordType === "order") && idempotencyKey) {
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

    const asaasPaymentId = paymentData.id as string | undefined;
    let recordId: string | null = null;

    if (asaasPaymentId && (recordType === "booking" || recordType === "order")) {
      if (recordType === "booking" && bodyBooking && typeof bodyBooking === "object") {
        const b = bodyBooking as {
          shopId?: string;
          clientId?: string;
          serviceId?: string;
          professionalId?: string;
          date?: string;
          time?: string;
          amount?: number;
          tip?: number;
        };
        if (b.shopId && b.clientId && b.serviceId && b.professionalId && b.date && b.time != null && b.amount != null) {
          const { data: apt, error: aptErr } = await supabaseAdmin
            .from("appointments")
            .insert({
              client_id: b.clientId,
              shop_id: b.shopId,
              service_id: b.serviceId,
              professional_id: b.professionalId,
              date: b.date,
              time: b.time,
              amount: Number(b.amount),
              status: "PENDING",
              asaas_payment_id: asaasPaymentId,
              payment_idempotency_key: idempotencyKey || null,
            })
            .select("id")
            .single();
          if (aptErr || !apt?.id) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "Cobrança criada, mas falhou ao registrar o agendamento pendente.",
                paymentId: asaasPaymentId,
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          recordId = apt.id;
        }
      } else if (recordType === "order" && bodyOrder && typeof bodyOrder === "object") {
        const o = bodyOrder as {
          shopId?: string;
          clientId?: string;
          items?: Array<{ productId: string; quantity: number; price: number }>;
          total?: number;
        };
        if (o.shopId && o.clientId && Array.isArray(o.items) && o.total != null) {
          const { data: ord, error: ordErr } = await supabaseAdmin
            .from("orders")
            .insert({
              client_id: o.clientId,
              shop_id: o.shopId,
              items: o.items,
              total: Number(o.total),
              status: "PENDING",
              asaas_payment_id: asaasPaymentId,
              payment_idempotency_key: idempotencyKey || null,
            })
            .select("id")
            .single();
          if (ordErr || !ord?.id) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "Cobrança criada, mas falhou ao registrar o pedido pendente.",
                paymentId: asaasPaymentId,
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          recordId = ord.id;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: paymentData,
        invoiceUrl: paymentData.invoiceUrl,
        id: paymentData.id,
        appointmentId: recordType === "booking" ? recordId : undefined,
        orderId: recordType === "order" ? recordId : undefined,
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
