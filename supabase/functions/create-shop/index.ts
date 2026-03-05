// Supabase Edge Function: create-shop
// Deno - cria loja no Supabase e cliente no Asaas, retorna shopId e asaasCustomerId

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
      JSON.stringify({ success: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { name, email, phone } = await req.json();
    if (!name || !email || !phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "name, email e phone são obrigatórios",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ASAAS_API_KEY não configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const asaasBaseUrl = (
      Deno.env.get("ASAAS_API_URL") || "https://sandbox.asaas.com/api/v3"
    ).replace(/\/$/, "");

    // 1. Criar cliente no Asaas (API v3 customers)
    const mobilePhone = String(phone)
      .replace(/\D/g, "")
      .slice(0, 11) || "11999999999";
    const asaasRes = await fetch(`${asaasBaseUrl}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaasApiKey,
      },
      body: JSON.stringify({
        name: String(name),
        email: String(email),
        mobilePhone,
        cpfCnpj: "00000000000",
      }),
    });

    if (!asaasRes.ok) {
      const errData = await asaasRes.text();
      console.error("Asaas customer error:", errData);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Falha ao criar cliente Asaas",
          details: errData,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const asaasCustomer = await asaasRes.json();
    const asaasCustomerId = asaasCustomer?.id ?? null;
    if (!asaasCustomerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Asaas não retornou customer id",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Criar registro na tabela shops no Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: shop, error: insertError } = await supabase
      .from("shops")
      .insert({
        name: String(name),
        email: String(email),
        phone: String(phone),
        asaas_customer_id: asaasCustomerId,
        type: "BARBER",
        subscription_active: true,
        subscription_amount: 99,
        rating: 5.0,
        profile_image:
          "https://picsum.photos/400?random=" + Math.floor(Math.random() * 100),
        banner_image:
          "https://picsum.photos/800/400?random=" +
          Math.floor(Math.random() * 100),
        address: "A definir",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const shopId = shop?.id ?? null;
    if (!shopId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Falha ao obter id da loja",
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
        shopId,
        asaasCustomerId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
