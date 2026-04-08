// Edge Function: shop-finance-webhook
// Callback do provisionador externo: atualiza shops e finance_provision_status.
// Auth: Authorization: Bearer <SHOP_FINANCE_WEBHOOK_SECRET>
/// <reference path="./deno.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function walletColumnByEnvironment(environment: "sandbox" | "production"): "asaas_wallet_id_sandbox" | "asaas_wallet_id_prod" {
  return environment === "sandbox" ? "asaas_wallet_id_sandbox" : "asaas_wallet_id_prod";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não permitido. Use POST." }, 405);
  }

  const expectedSecret = Deno.env.get("SHOP_FINANCE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!expectedSecret || !supabaseUrl || !serviceRole) {
    return jsonResponse({ success: false, error: "Configuração incompleta no servidor." }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (token !== expectedSecret) {
    return jsonResponse({ success: false, error: "Não autorizado." }, 401);
  }

  let body: {
    shopId?: string;
    asaasCustomerId?: string | null;
    asaasAccountId?: string | null;
    asaasWalletId?: string | null;
    asaasApiKey?: string | null;
    error?: string | null;
    correlationId?: string | null;
    environment?: "sandbox" | "production" | null;
  } = {};

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "JSON inválido." }, 400);
  }
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const walletColumn = walletColumnByEnvironment(environment);

  const shopId = body.shopId != null ? String(body.shopId).trim() : "";
  if (!shopId) {
    return jsonResponse({ success: false, error: "shopId é obrigatório." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  const { data: shop, error: fetchErr } = await supabase
    .from("shops")
    .select("id, finance_provision_status, asaas_wallet_id")
    .eq("id", shopId)
    .maybeSingle();

  if (fetchErr || !shop) {
    return jsonResponse({ success: false, error: "Loja não encontrada." }, 404);
  }

  if (shop.finance_provision_status === "active") {
    const existingWallet = shop.asaas_wallet_id != null ? String(shop.asaas_wallet_id).trim() : "";
    const incomingWallet = body.asaasWalletId != null ? String(body.asaasWalletId).trim() : "";
    if (!incomingWallet || !existingWallet || incomingWallet === existingWallet) {
      return jsonResponse({ success: true, duplicate: true, message: "Já ativo." });
    }
  }

  if (body.error != null && String(body.error).trim() !== "") {
    const errMsg = String(body.error).trim().slice(0, 2000);
    const { data: cur } = await supabase
      .from("shops")
      .select("finance_provision_attempts")
      .eq("id", shopId)
      .single();
    const attempts = Number(cur?.finance_provision_attempts) || 0;
    await supabase
      .from("shops")
      .update({
        finance_provision_status: "failed",
        finance_provision_last_error: errMsg,
        finance_provision_attempts: attempts + 1,
        finance_provision_updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);
    return jsonResponse({ success: true, status: "failed" });
  }

  const walletId = body.asaasWalletId != null ? String(body.asaasWalletId).trim() : "";
  if (!walletId) {
    return jsonResponse({ success: false, error: "asaasWalletId é obrigatório quando não há error." }, 400);
  }

  const updateRow: Record<string, unknown> = {
    asaas_wallet_id: walletId,
    [walletColumn]: walletId,
    finance_provision_status: "active",
    finance_provision_last_error: null,
    finance_provision_updated_at: new Date().toISOString(),
  };

  if (body.asaasCustomerId != null && String(body.asaasCustomerId).trim() !== "") {
    updateRow.asaas_customer_id = String(body.asaasCustomerId).trim();
  }
  if (body.asaasAccountId != null && String(body.asaasAccountId).trim() !== "") {
    updateRow.asaas_account_id = String(body.asaasAccountId).trim();
  }
  if (body.asaasApiKey != null && String(body.asaasApiKey).trim() !== "") {
    updateRow.asaas_api_key = String(body.asaasApiKey).trim();
  }

  const { error: upErr } = await supabase.from("shops").update(updateRow).eq("id", shopId);
  if (upErr) {
    return jsonResponse({ success: false, error: upErr.message }, 500);
  }

  return jsonResponse({ success: true, status: "active" });
});
