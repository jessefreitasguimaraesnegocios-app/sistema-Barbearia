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
    const { name, email, phone, cpfCnpj: bodyCpf, password, type: shopType } = await req.json();
    if (!name || !email || !phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "name, email e phone são obrigatórios",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const ownerPassword = password && String(password).length >= 6 ? String(password) : null;
    if (!ownerPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Senha inicial é obrigatória (mínimo 6 caracteres) para o dono acessar o sistema.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ASAAS_API_KEY não configurada" }),
        {
          status: 200,
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
    const cpfCnpjDigits = bodyCpf != null
      ? String(bodyCpf).replace(/\D/g, "").slice(0, 14)
      : "";
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
        cpfCnpj: cpfCnpjDigits.length >= 11 ? cpfCnpjDigits : "00000000000",
      }),
    });

    if (!asaasRes.ok) {
      const errText = await asaasRes.text();
      let errMessage = "Falha ao criar cliente Asaas";
      let details = errText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.errors?.[0]?.description) {
          errMessage = errJson.errors[0].description;
        } else if (errJson?.error) {
          errMessage = errJson.error;
        }
      } catch (_) {}
      console.error("Asaas customer error:", errText);
      return new Response(
        JSON.stringify({
          success: false,
          error: errMessage,
          details,
        }),
        {
          status: 200,
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
          status: 200,
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
        type: (shopType === "SALON" ? "SALON" : "BARBER"),
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
          status: 200,
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
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Criar usuário no Supabase Auth (dono da loja) para login com email/senha
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: String(email),
      password: ownerPassword,
      email_confirm: true,
    });

    if (authError) {
      console.error("Auth createUser error:", authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: authError.message === "A user with this email address has already been registered"
            ? "Já existe um usuário com este e-mail. O dono já pode fazer login."
            : authError.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ownerId = authData?.user?.id ?? null;
    if (!ownerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Falha ao obter id do usuário criado",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Vincular loja ao dono (owner_id) e criar perfil (profiles)
    const { error: updateOwnerError } = await supabase
      .from("shops")
      .update({ owner_id: ownerId })
      .eq("id", shopId);

    if (updateOwnerError) {
      console.error("Update shop owner_id error:", updateOwnerError);
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: ownerId,
      role: "barbearia",
      shop_id: shopId,
    });

    if (profileError) {
      console.error("Profile insert error:", profileError);
      return new Response(
        JSON.stringify({
          success: false,
          error: profileError.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopId,
        asaasCustomerId,
        ownerCreated: true,
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
