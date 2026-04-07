// Supabase Edge Function: create-shop
// Cria loja no Supabase + Auth; provisionamento Asaas é assíncrono (process-shop-finance / webhook).
/// <reference path="./deno.d.ts" />

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
    const bodyJson = await req.json();
    const {
      name,
      email,
      phone,
      cpfCnpj: bodyCpf,
      password,
      type: shopType,
      birthDate: bodyBirthDate,
      companyType: bodyCompanyType,
      address: bodyAddress,
      addressNumber: bodyAddressNumber,
      complement: bodyComplement,
      province: bodyProvince,
      postalCode: bodyPostalCode,
      incomeValue: bodyIncomeValue,
      subscriptionAmount: bodySubscriptionAmount,
      pixKey: bodyPixKey,
    } = bodyJson as Record<string, unknown>;

    if (!name || !email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nome do estabelecimento e e-mail do dono são obrigatórios.",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey) as ReturnType<typeof createClient>;

    const sourceIp = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0]?.trim() || "unknown";
    const rateSubject = `create-shop:${String(email).trim().toLowerCase()}:${sourceIp}`;
    const { data: allowedByRateLimit, error: rateErr } = await supabase.rpc("security_check_rate_limit", {
      p_route: "create-shop",
      p_subject: rateSubject,
      p_limit: 5,
      p_window_seconds: 60,
    });
    if (rateErr) {
      console.error("[create-shop] rate limit rpc error:", rateErr.message);
    }
    if (allowedByRateLimit === false) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Muitas tentativas de cadastro. Aguarde 1 minuto e tente novamente.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cpfCnpjDigits = bodyCpf != null ? String(bodyCpf).replace(/\D/g, "").slice(0, 14) : "";
    const companyType = bodyCompanyType && String(bodyCompanyType).trim() !== "" ? String(bodyCompanyType).trim() : "MEI";
    const asaasCompanyType = companyType === "PF" ? "INDIVIDUAL" : companyType;

    if (asaasCompanyType === "INDIVIDUAL" && cpfCnpjDigits.length !== 11) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Para pessoa física é obrigatório informar CPF com 11 dígitos.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const postalCodeDigits = bodyPostalCode != null ? String(bodyPostalCode).replace(/\D/g, "").slice(0, 8) : "";
    const postalCode = postalCodeDigits.length === 8 ? postalCodeDigits : "01310100";
    const birthDate = bodyBirthDate && String(bodyBirthDate).trim() !== "" ? String(bodyBirthDate).trim() : "1994-05-16";
    const address = bodyAddress && String(bodyAddress).trim() !== "" ? String(bodyAddress).trim() : "A definir";
    const addressNumber = bodyAddressNumber && String(bodyAddressNumber).trim() !== "" ? String(bodyAddressNumber).trim() : "S/N";
    const complement = bodyComplement != null ? String(bodyComplement).trim() : "";
    const province = bodyProvince && String(bodyProvince).trim() !== "" ? String(bodyProvince).trim() : "Centro";
    const incomeValue = typeof bodyIncomeValue === "number" && bodyIncomeValue > 0 ? bodyIncomeValue : 5000;

    const subRaw = Number(bodySubscriptionAmount);
    const subscription_amount =
      Number.isFinite(subRaw) && subRaw >= 0 ? Math.min(999999, Math.floor(subRaw)) : 99;

    const pixKeyTrim =
      bodyPixKey != null && String(bodyPixKey).trim() !== "" ? String(bodyPixKey).trim().slice(0, 500) : null;

    /** Snapshot legado para workers; cadastro admin é mínimo — financeiro preenchido noutro sistema. */
    const finance_provision_payload = {
      registeredVia: "admin_dashboard_minimal",
      birthDate,
      companyType,
      postalCode,
      address,
      addressNumber,
      complement,
      province,
      incomeValue,
    };

    const rawType =
      shopType != null && String(shopType).trim() !== ""
        ? String(shopType).trim().toUpperCase()
        : "BARBER";
    const allowedShopTypes = ["BARBER", "SALON", "MANICURE"] as const;
    const resolvedShopType = (allowedShopTypes as readonly string[]).includes(rawType)
      ? (rawType as (typeof allowedShopTypes)[number])
      : "BARBER";

    const isSalon = resolvedShopType === "SALON";
    const isManicure = resolvedShopType === "MANICURE";
    const barberProfiles = [
      "https://images.unsplash.com/photo-1585747860715-2ba9226a93f8?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1599351432882-e4723832b434?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1521590832167-8fcbf2ddcd85?w=400&h=400&fit=crop",
    ];
    const barberBanners = [
      "https://images.unsplash.com/photo-1585747860715-2ba9226a93f8?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1599351432882-e4723832b434?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1521590832167-8fcbf2ddcd85?w=800&h=400&fit=crop",
    ];
    const salonProfiles = [
      "https://images.unsplash.com/photo-1560066984-138dadb4e035?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1522337360788-8b5de6d8f8f8?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1560750588-73207bcf3fe8?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=400&h=400&fit=crop",
    ];
    const salonBanners = [
      "https://images.unsplash.com/photo-1560066984-138dadb4e035?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1522337360788-8b5de6d8f8f8?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1560750588-73207bcf3fe8?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&h=400&fit=crop",
    ];
    const manicureProfiles = [
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1519014816548-bf697886cd7c?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1522338242992-e2a73275f588?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop",
    ];
    const manicureBanners = [
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1519014816548-bf697886cd7c?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1522338242992-e2a73275f588?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=800&h=400&fit=crop",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&h=400&fit=crop",
    ];
    const profileList = isManicure ? manicureProfiles : isSalon ? salonProfiles : barberProfiles;
    const bannerList = isManicure ? manicureBanners : isSalon ? salonBanners : barberBanners;
    const idx = Math.floor(Math.random() * profileList.length);
    const profile_image = profileList[idx];
    const banner_image = bannerList[idx];

    const phoneTrim = phone != null && String(phone).trim() !== "" ? String(phone).trim() : null;

    const { data: shop, error: insertError } = await supabase
      .from("shops")
      .insert({
        name: String(name),
        email: String(email),
        phone: phoneTrim,
        cnpj_cpf: cpfCnpjDigits.length >= 11 ? cpfCnpjDigits : null,
        type: resolvedShopType,
        subscription_active: true,
        subscription_amount,
        pix_key: pixKeyTrim,
        rating: 5.0,
        profile_image,
        banner_image,
        address: [address, addressNumber, complement, province, postalCode].filter(Boolean).join(", ") || address,
        finance_provision_status: "pending",
        finance_provision_payload,
        finance_provision_updated_at: new Date().toISOString(),
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

    const { error: updateOwnerError } = await supabase
      .from("shops")
      .update({ owner_id: ownerId })
      .eq("id", shopId);

    if (updateOwnerError) {
      console.error("Update shop owner_id error:", updateOwnerError);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        { id: ownerId, role: "barbearia", shop_id: shopId },
        { onConflict: "id" }
      );

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
        ownerCreated: true,
        financeProvisionStatus: "pending",
        financePending: true,
        message:
          "Estabelecimento criado. Dados bancários e vínculo Asaas ficam no teu sistema externo.",
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
