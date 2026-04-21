// Supabase Edge Function: create-shop
// Cria loja no Supabase + Auth; provisionamento Asaas é assíncrono (process-shop-finance / webhook).
/// <reference path="./deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readAsaasApiKey, readAsaasBaseUrl } from "../_shared/asaasEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type RuntimeMode = "production" | "sandbox";

function asaasRuntimeModeFromPlatformRow(data: { asaas_mode?: unknown } | null | undefined): RuntimeMode {
  return data?.asaas_mode === "sandbox" ? "sandbox" : "production";
}

function platformAsaasConfigForMode(mode: RuntimeMode): { mode: RuntimeMode; apiKey: string; apiUrl: string } {
  const defaultProd = "https://api.asaas.com/v3";
  const defaultSandbox = "https://api-sandbox.asaas.com/v3";
  if (mode === "sandbox") {
    return {
      mode,
      apiKey: readAsaasApiKey("ASAAS_API_KEY_SANDBOX", "ASAAS_API_KEY"),
      apiUrl: readAsaasBaseUrl(["ASAAS_API_URL_SANDBOX", "ASAAS_API_URL"], defaultSandbox),
    };
  }
  return {
    mode,
    apiKey: readAsaasApiKey("ASAAS_API_KEY"),
    apiUrl: readAsaasBaseUrl(["ASAAS_API_URL"], defaultProd),
  };
}

function normalizeAsaasMobilePhone(rawPhone: unknown): string {
  const fallback = "11999999999";
  if (rawPhone == null) return fallback;
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return fallback;
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length === 10) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (!/^\d{2}9\d{8}$/.test(digits)) return fallback;
  return digits;
}

function nextMonthlyDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function asaasErrorMessageFromText(raw: string, fallback: string): string {
  try {
    const j = JSON.parse(raw) as { errors?: Array<{ description?: string }>; error?: string };
    return j?.errors?.[0]?.description || j?.error || raw || fallback;
  } catch {
    return raw || fallback;
  }
}

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
      splitPercent: bodySplitPercent,
      splitPercentSandbox: bodySplitPercentSandbox,
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

    const readSplit0to100 = (raw: unknown, fallback: number): number => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
      return Math.min(100, Math.max(0, Math.floor(n)));
    };
    const split_percent = readSplit0to100(bodySplitPercent, 95);
    const split_percent_sandbox =
      bodySplitPercentSandbox === undefined || bodySplitPercentSandbox === null || bodySplitPercentSandbox === ""
        ? null
        : readSplit0to100(bodySplitPercentSandbox, split_percent);

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

    /** Dono primeiro + loja já com owner_id: menos um round-trip e sem loja órfã se o Auth falhar. */
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

    const { data: shop, error: insertError } = await supabase
      .from("shops")
      .insert({
        owner_id: ownerId,
        name: String(name),
        email: String(email),
        phone: phoneTrim,
        cnpj_cpf: cpfCnpjDigits.length >= 11 ? cpfCnpjDigits : null,
        type: resolvedShopType,
        subscription_active: true,
        subscription_amount,
        split_percent,
        split_percent_sandbox,
        pix_key: pixKeyTrim,
        rating: 5.0,
        profile_image,
        banner_image,
        address: [address, addressNumber, complement, province, postalCode].filter(Boolean).join(", ") || address,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      const { error: delErr } = await supabase.auth.admin.deleteUser(ownerId);
      if (delErr) console.error("[create-shop] rollback deleteUser:", delErr.message);
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
      const { error: delErr } = await supabase.auth.admin.deleteUser(ownerId);
      if (delErr) console.error("[create-shop] rollback deleteUser:", delErr.message);
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

    const { error: fpInsertError } = await supabase.from("shop_finance_provision").insert({
      shop_id: shopId,
      finance_provision_status: "pending",
      finance_provision_payload,
      finance_provision_updated_at: new Date().toISOString(),
    });
    if (fpInsertError) {
      console.error("[create-shop] shop_finance_provision insert:", fpInsertError);
      await supabase.from("shops").delete().eq("id", shopId);
      const { error: delErr } = await supabase.auth.admin.deleteUser(ownerId);
      if (delErr) console.error("[create-shop] rollback deleteUser:", delErr.message);
      return new Response(
        JSON.stringify({ success: false, error: fpInsertError.message }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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

    // Provisionamento automático (best-effort) da assinatura mensal da plataforma na conta mãe.
    // Se falhar, não aborta criação da loja: admin pode sincronizar depois.
    let autoSubscriptionId: string | null = null;
    let autoSubscriptionWarning: string | null = null;
    try {
      const { data: runtimeRow } = await supabase
        .from("platform_runtime_settings")
        .select("asaas_mode")
        .eq("singleton_id", true)
        .maybeSingle();
      const runtimeMode = asaasRuntimeModeFromPlatformRow(runtimeRow as { asaas_mode?: unknown } | null | undefined);
      const config = platformAsaasConfigForMode(runtimeMode);
      if (!config.apiKey) {
        throw new Error(`ASAAS_API_KEY ausente para ${runtimeMode}.`);
      }

      const cnpjCpfForCustomer = cpfCnpjDigits.length === 11 || cpfCnpjDigits.length === 14 ? cpfCnpjDigits : "";
      const customerLookupByCpf = cnpjCpfForCustomer
        ? await fetch(`${config.apiUrl}/customers?cpfCnpj=${encodeURIComponent(cnpjCpfForCustomer)}&limit=1&offset=0`, {
          method: "GET",
          headers: { "Content-Type": "application/json", access_token: config.apiKey },
        })
        : null;
      let asaasCustomerId: string | null = null;
      if (customerLookupByCpf?.ok) {
        const j = (await customerLookupByCpf.json()) as { data?: Array<{ id?: string }> };
        asaasCustomerId = j?.data?.[0]?.id?.trim() || null;
      }
      if (!asaasCustomerId) {
        const customerRes = await fetch(`${config.apiUrl}/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: config.apiKey },
          body: JSON.stringify({
            name: String(name),
            email: String(email),
            mobilePhone: normalizeAsaasMobilePhone(phoneTrim ?? undefined),
            cpfCnpj: cnpjCpfForCustomer || undefined,
          }),
        });
        const customerTxt = await customerRes.text();
        if (!customerRes.ok) {
          throw new Error(asaasErrorMessageFromText(customerTxt, "Falha ao criar cliente da mensalidade no Asaas."));
        }
        const customerJson = JSON.parse(customerTxt) as { id?: string };
        asaasCustomerId = customerJson?.id?.trim() || null;
        if (!asaasCustomerId) throw new Error("Asaas não retornou customer id para mensalidade.");
      }

      const subRes = await fetch(`${config.apiUrl}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: config.apiKey },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "UNDEFINED",
          cycle: "MONTHLY",
          value: subscription_amount,
          nextDueDate: nextMonthlyDueDate(),
          description: `Mensalidade plataforma - ${String(name)}`.slice(0, 120),
          externalReference: `shop:${shopId}:platform-subscription`,
        }),
      });
      const subTxt = await subRes.text();
      if (!subRes.ok) {
        throw new Error(asaasErrorMessageFromText(subTxt, "Falha ao criar assinatura mensal no Asaas."));
      }
      const subJson = JSON.parse(subTxt) as { id?: string };
      autoSubscriptionId = subJson?.id?.trim() || null;
      if (!autoSubscriptionId) throw new Error("Asaas não retornou subscription id da mensalidade.");

      const updatePayload: Record<string, unknown> = {
        asaas_platform_subscription_id: autoSubscriptionId,
      };
      if (asaasCustomerId) updatePayload.asaas_customer_id = asaasCustomerId;
      const { error: autoSubUpdateErr } = await supabase
        .from("shops")
        .update(updatePayload)
        .eq("id", shopId);
      if (autoSubUpdateErr) throw new Error(autoSubUpdateErr.message);
    } catch (autoErr) {
      autoSubscriptionWarning = autoErr instanceof Error ? autoErr.message : String(autoErr);
      console.error("[create-shop] auto monthly subscription:", autoSubscriptionWarning);
    }

    return new Response(
      JSON.stringify({
        success: true,
        shopId,
        ownerCreated: true,
        financeProvisionStatus: "pending",
        financePending: true,
        autoMonthlySubscriptionCreated: autoSubscriptionId != null,
        asaasPlatformSubscriptionId: autoSubscriptionId,
        autoMonthlySubscriptionWarning: autoSubscriptionWarning,
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
