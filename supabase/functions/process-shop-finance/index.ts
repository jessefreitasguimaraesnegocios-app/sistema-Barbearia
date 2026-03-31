// Edge Function: process-shop-finance
// Provisiona Asaas (customer + subconta + token) ou delega a provisionador externo.
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
/// <reference path="./deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProvisionPayload = {
  birthDate?: string;
  companyType?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  incomeValue?: number;
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveEnvironment(asaasApiUrl: string, explicit?: string): "sandbox" | "production" {
  if (explicit === "sandbox" || explicit === "production") return explicit;
  return asaasApiUrl.toLowerCase().includes("sandbox") ? "sandbox" : "production";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não permitido. Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ success: false, error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (token !== serviceRole) {
    return jsonResponse({ success: false, error: "Não autorizado." }, 401);
  }

  let body: { shopId?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const shopIdFilter = body.shopId != null ? String(body.shopId).trim() : "";
  const limit = Math.min(20, Math.max(1, Number(body.limit) || 5));

  const supabase = createClient(supabaseUrl, serviceRole);
  const shopProvisionerUrl = Deno.env.get("ASAAS_SHOP_PROVISIONER_URL")?.replace(/\/$/, "");
  const shopProvisionerToken = Deno.env.get("ASAAS_SHOP_PROVISIONER_TOKEN");
  const shopProvisionerAppId = Deno.env.get("ASAAS_SHOP_PROVISIONER_APP_ID");

  /** Resolve uma loja já com carteira para active (reparo). */
  async function ensureActiveIfHasWallet(sid: string): Promise<boolean> {
    const { data: row } = await supabase
      .from("shops")
      .select("id, asaas_wallet_id, finance_provision_status")
      .eq("id", sid)
      .maybeSingle();
    if (!row) return false;
    const w = row.asaas_wallet_id != null ? String(row.asaas_wallet_id).trim() : "";
    if (w && row.finance_provision_status !== "active") {
      await supabase
        .from("shops")
        .update({
          finance_provision_status: "active",
          finance_provision_last_error: null,
          finance_provision_updated_at: new Date().toISOString(),
        })
        .eq("id", sid);
      return true;
    }
    return !!w;
  }

  async function listCandidateIds(): Promise<string[]> {
    if (shopIdFilter) return [shopIdFilter];
    const { data: rows } = await supabase
      .from("shops")
      .select("id, asaas_wallet_id")
      .in("finance_provision_status", ["pending", "failed"])
      .limit(limit * 3);
    const ids = (rows || [])
      .filter((r: { asaas_wallet_id?: string | null }) => !r.asaas_wallet_id || String(r.asaas_wallet_id).trim() === "")
      .map((r: { id: string }) => r.id)
      .filter(Boolean)
      .slice(0, limit);
    return ids;
  }

  const candidateIds = shopIdFilter ? [shopIdFilter] : await listCandidateIds();
  if (candidateIds.length === 0) {
    return jsonResponse({ success: true, processed: 0, results: [], message: "Nenhuma loja elegível." });
  }

  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
  const asaasBaseUrl = (Deno.env.get("ASAAS_API_URL") || "https://sandbox.asaas.com/api/v3").replace(/\/$/, "");

  const results: Array<{ shopId: string; ok: boolean; status?: string; error?: string }> = [];

  for (const shopId of candidateIds) {
    if (await ensureActiveIfHasWallet(shopId)) {
      results.push({ shopId, ok: true, status: "active_repaired" });
      continue;
    }

    const { data: claimed, error: claimErr } = await supabase
      .from("shops")
      .update({
        finance_provision_status: "processing",
        finance_provision_updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .in("finance_provision_status", ["pending", "failed"])
      .select(
        "id, name, email, phone, cnpj_cpf, address, finance_provision_payload, finance_provision_attempts, asaas_wallet_id, asaas_customer_id, asaas_account_id"
      )
      .maybeSingle();

    if (claimErr || !claimed) {
      const { data: cur } = await supabase
        .from("shops")
        .select("finance_provision_status, asaas_wallet_id")
        .eq("id", shopId)
        .maybeSingle();
      if (cur?.asaas_wallet_id && String(cur.asaas_wallet_id).trim()) {
        await ensureActiveIfHasWallet(shopId);
        results.push({ shopId, ok: true, status: "already_has_wallet" });
      } else {
        results.push({
          shopId,
          ok: false,
          error: claimErr?.message || "Não foi possível reservar a loja (status não é pending/failed).",
        });
      }
      continue;
    }

    const attempts = Number(claimed.finance_provision_attempts) || 0;

    const bumpFailed = async (msg: string) => {
      await supabase
        .from("shops")
        .update({
          finance_provision_status: "failed",
          finance_provision_last_error: msg.slice(0, 2000),
          finance_provision_attempts: attempts + 1,
          finance_provision_updated_at: new Date().toISOString(),
        })
        .eq("id", shopId);
    };

    if (shopProvisionerUrl) {
      const environment = resolveEnvironment(asaasBaseUrl, Deno.env.get("ASAAS_PROVISIONER_ENV") || undefined);
      const correlationId = crypto.randomUUID();
      const cpfCnpjDigits = String(claimed.cnpj_cpf || "").replace(/\D/g, "");
      const payload = (claimed.finance_provision_payload || {}) as ProvisionPayload;

      const extBody: Record<string, unknown> = {
        shop_id: shopId,
        environment,
        name: String(claimed.name || "Loja").trim(),
        email: String(claimed.email || "").trim(),
        phone: String(claimed.phone || "").replace(/\D/g, "").slice(0, 11) || "11999999999",
        cpfCnpj: cpfCnpjDigits || undefined,
        birthDate: payload.birthDate || "1994-05-16",
        companyType: payload.companyType === "PF" ? "INDIVIDUAL" : (payload.companyType || "MEI"),
        address: payload.address || claimed.address || "A definir",
        addressNumber: payload.addressNumber || "S/N",
        complement: payload.complement || "",
        province: payload.province || "Centro",
        postalCode: (payload.postalCode || "").replace(/\D/g, "").slice(0, 8) || "01310100",
        incomeValue: typeof payload.incomeValue === "number" ? payload.incomeValue : 5000,
        correlation_id: correlationId,
      };
      if (shopProvisionerAppId) extBody.app_id = shopProvisionerAppId;

      try {
        const extRes = await fetch(shopProvisionerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(shopProvisionerToken ? { Authorization: `Bearer ${shopProvisionerToken}` } : {}),
          },
          body: JSON.stringify(extBody),
        });
        const extText = await extRes.text();
        if (!extRes.ok) {
          await bumpFailed(extText || `HTTP ${extRes.status}`);
          results.push({ shopId, ok: false, error: extText || `HTTP ${extRes.status}` });
          continue;
        }
        await supabase
          .from("shops")
          .update({
            finance_provision_status: "awaiting_callback",
            finance_provision_correlation_id: correlationId,
            finance_provision_attempts: attempts + 1,
            finance_provision_last_error: null,
            finance_provision_updated_at: new Date().toISOString(),
          })
          .eq("id", shopId);
        results.push({ shopId, ok: true, status: "awaiting_callback" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await bumpFailed(msg);
        results.push({ shopId, ok: false, error: msg });
      }
      continue;
    }

    if (!asaasApiKey) {
      await bumpFailed("ASAAS_API_KEY não configurada no worker.");
      results.push({ shopId, ok: false, error: "ASAAS_API_KEY ausente." });
      continue;
    }

    const payload = (claimed.finance_provision_payload || {}) as ProvisionPayload;
    const mobilePhone =
      String(claimed.phone || "")
        .replace(/\D/g, "")
        .slice(0, 11) || "31999999999";
    const cpfCnpjDigits = String(claimed.cnpj_cpf || "").replace(/\D/g, "").slice(0, 14);
    const companyTypeRaw = payload.companyType && String(payload.companyType).trim() !== ""
      ? String(payload.companyType).trim()
      : "MEI";
    const asaasCompanyType = companyTypeRaw === "PF" ? "INDIVIDUAL" : companyTypeRaw;

    if (asaasCompanyType === "INDIVIDUAL" && cpfCnpjDigits.length !== 11) {
      await bumpFailed("Para Autônomo (CPF) é obrigatório CPF com 11 dígitos na loja.");
      results.push({ shopId, ok: false, error: "CPF obrigatório para INDIVIDUAL." });
      continue;
    }

    const postalCodeDigits = payload.postalCode != null ? String(payload.postalCode).replace(/\D/g, "").slice(0, 8) : "";
    const postalCode = postalCodeDigits.length === 8 ? postalCodeDigits : "01310100";
    const birthDate =
      payload.birthDate && String(payload.birthDate).trim() !== "" ? String(payload.birthDate).trim() : "1994-05-16";
    const address =
      payload.address && String(payload.address).trim() !== "" ? String(payload.address).trim() : "A definir";
    const addressNumber =
      payload.addressNumber && String(payload.addressNumber).trim() !== ""
        ? String(payload.addressNumber).trim()
        : "S/N";
    const complement = payload.complement != null ? String(payload.complement).trim() : "";
    const province =
      payload.province && String(payload.province).trim() !== "" ? String(payload.province).trim() : "Centro";
    const incomeValue = typeof payload.incomeValue === "number" && payload.incomeValue > 0 ? payload.incomeValue : 5000;
    const cpfCnpjForAccount = cpfCnpjDigits.length >= 11 ? cpfCnpjDigits : "00000000000";

    try {
      const asaasRes = await fetch(`${asaasBaseUrl}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        body: JSON.stringify({
          name: String(claimed.name),
          email: String(claimed.email),
          mobilePhone,
          cpfCnpj: cpfCnpjDigits.length >= 11 ? cpfCnpjDigits : "00000000000",
        }),
      });

      if (!asaasRes.ok) {
        const errText = await asaasRes.text();
        let errMessage = errText;
        try {
          const errJson = JSON.parse(errText);
          errMessage = errJson?.errors?.[0]?.description || errJson?.error || errText;
        } catch (_) {}
        await bumpFailed(errMessage);
        results.push({ shopId, ok: false, error: errMessage });
        continue;
      }

      const asaasCustomer = await asaasRes.json();
      const asaasCustomerId = asaasCustomer?.id ?? null;
      if (!asaasCustomerId) {
        await bumpFailed("Asaas não retornou customer id");
        results.push({ shopId, ok: false, error: "Sem customer id" });
        continue;
      }

      const accountRes = await fetch(`${asaasBaseUrl}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
        body: JSON.stringify({
          name: String(claimed.name),
          email: String(claimed.email),
          loginEmail: String(claimed.email),
          cpfCnpj: cpfCnpjForAccount,
          birthDate,
          companyType: asaasCompanyType,
          phone: String(claimed.phone) || null,
          mobilePhone,
          incomeValue,
          address,
          addressNumber,
          ...(complement !== "" && { complement }),
          province,
          postalCode,
        }),
      });

      if (!accountRes.ok) {
        const errText = await accountRes.text();
        let errMessage = errText;
        try {
          const errJson = JSON.parse(errText);
          errMessage = errJson?.errors?.[0]?.description || errJson?.error || errText;
        } catch (_) {}
        await bumpFailed(errMessage);
        results.push({ shopId, ok: false, error: errMessage });
        continue;
      }

      const accountData = (await accountRes.json()) as {
        id?: string;
        accountId?: string;
        walletId?: string;
        wallet?: string;
      };
      const asaasWalletId = accountData?.walletId ?? accountData?.wallet ?? null;
      const asaasAccountId = accountData?.id ?? accountData?.accountId ?? null;

      if (!asaasWalletId || String(asaasWalletId).trim() === "") {
        await bumpFailed("Asaas não retornou walletId da subconta.");
        results.push({ shopId, ok: false, error: "Sem walletId" });
        continue;
      }

      const isSandbox = asaasBaseUrl.toLowerCase().includes("sandbox");
      if (isSandbox && asaasAccountId && String(asaasAccountId).trim() !== "") {
        try {
          const approveRes = await fetch(`${asaasBaseUrl}/accounts/${asaasAccountId}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json", access_token: asaasApiKey },
          });
          if (!approveRes.ok) {
            console.warn("[process-shop-finance] sandbox approve:", approveRes.status, await approveRes.text());
          }
        } catch (e) {
          console.warn("[process-shop-finance] sandbox approve error:", e);
        }
      }

      let asaasApiKeySub: string | null = null;
      if (asaasAccountId && String(asaasAccountId).trim() !== "") {
        try {
          await new Promise((r) => setTimeout(r, 2000));
          const tokenRes = await fetch(`${asaasBaseUrl}/accounts/${asaasAccountId}/accessTokens`, {
            method: "POST",
            headers: { "Content-Type": "application/json", access_token: asaasApiKey },
            body: JSON.stringify({ name: "Smart Cria App" }),
          });
          if (tokenRes.ok) {
            const tokenData = (await tokenRes.json()) as { apiKey?: string };
            const key = tokenData?.apiKey?.trim();
            if (key) asaasApiKeySub = key;
          }
        } catch (e) {
          console.error("[process-shop-finance] accessTokens:", e);
        }
      }

      const updateRow: Record<string, unknown> = {
        asaas_customer_id: asaasCustomerId,
        asaas_wallet_id: asaasWalletId,
        asaas_account_id: asaasAccountId ?? null,
        finance_provision_status: "active",
        finance_provision_last_error: null,
        finance_provision_attempts: attempts + 1,
        finance_provision_updated_at: new Date().toISOString(),
      };
      if (asaasApiKeySub) updateRow.asaas_api_key = asaasApiKeySub;

      const { error: upErr } = await supabase.from("shops").update(updateRow).eq("id", shopId);
      if (upErr) {
        await bumpFailed(upErr.message);
        results.push({ shopId, ok: false, error: upErr.message });
        continue;
      }

      results.push({ shopId, ok: true, status: "active" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await bumpFailed(msg);
      results.push({ shopId, ok: false, error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return jsonResponse({
    success: true,
    processed: results.length,
    succeeded: okCount,
    results,
  });
});
