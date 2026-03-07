// Supabase Edge Function: create-payment
// Cria cobrança Asaas (PIX) com split para a carteira da loja e opcionalmente grava agendamento/pedido PENDING no Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      recordType,
      booking: bodyBooking,
      order: bodyOrder,
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

    const asaasPaymentId = paymentData.id as string | undefined;
    let recordId: string | null = null;

    if (asaasPaymentId && (recordType === "booking" || recordType === "order")) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
            const { data: apt, error: aptErr } = await supabase
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
              })
              .select("id")
              .single();
            if (!aptErr && apt?.id) recordId = apt.id;
          }
        } else if (recordType === "order" && bodyOrder && typeof bodyOrder === "object") {
          const o = bodyOrder as {
            shopId?: string;
            clientId?: string;
            items?: Array<{ productId: string; quantity: number; price: number }>;
            total?: number;
          };
          if (o.shopId && o.clientId && Array.isArray(o.items) && o.total != null) {
            const { data: ord, error: ordErr } = await supabase
              .from("orders")
              .insert({
                client_id: o.clientId,
                shop_id: o.shopId,
                items: o.items,
                total: Number(o.total),
                status: "PENDING",
                asaas_payment_id: asaasPaymentId,
              })
              .select("id")
              .single();
            if (!ordErr && ord?.id) recordId = ord.id;
          }
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
