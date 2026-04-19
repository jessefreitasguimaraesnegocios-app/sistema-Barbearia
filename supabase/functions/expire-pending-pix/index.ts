/// <reference path="../create-shop/deno.d.ts" />
// Supabase Edge: expira cobranças PIX pendentes (Asaas DELETE + BD CANCELLED).
// Auth: (1) Authorization: Bearer <SERVICE_ROLE> OU (2) header x-expire-pix-cron = EXPIRE_PENDING_PIX_CRON_SECRET (Edge secret).
// Agendador externo (ex. cron-job.org): POST URL da função + apikey (anon) + x-expire-pix-cron — sem rota extra na Vercel (limite Hobby 12 funções).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readAsaasApiKey, readAsaasBaseUrl } from "../_shared/asaasEnv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-expire-pix-cron",
};

type RuntimeMode = "production" | "sandbox";

const PIX_PENDING_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ROWS_PER_RUN = 40;

const PAID_LIKE = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
function isPaidAsaasStatus(s: string): boolean {
  return PAID_LIKE.has(s.trim().toUpperCase());
}

async function resolveAsaasRuntimeConfig(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ mode: RuntimeMode; apiKey: string; apiUrl: string } | null> {
  let mode: RuntimeMode = "production";
  const { data } = await supabaseAdmin
    .from("platform_runtime_settings")
    .select("asaas_mode")
    .eq("singleton_id", true)
    .maybeSingle();
  if (data?.asaas_mode === "sandbox") mode = "sandbox";

  const defaultProdUrl = "https://api.asaas.com/v3";
  const defaultSandboxUrl = "https://api-sandbox.asaas.com/v3";
  if (mode === "sandbox") {
    const apiKey = readAsaasApiKey("ASAAS_API_KEY_SANDBOX", "ASAAS_API_KEY");
    if (!apiKey) return null;
    return {
      mode,
      apiKey,
      apiUrl: readAsaasBaseUrl(["ASAAS_API_URL_SANDBOX", "ASAAS_API_URL"], defaultSandboxUrl),
    };
  }
  const apiKey = readAsaasApiKey("ASAAS_API_KEY");
  if (!apiKey) return null;
  return {
    mode,
    apiKey,
    apiUrl: readAsaasBaseUrl(["ASAAS_API_URL"], defaultProdUrl),
  };
}

type AsaasGetPay = { kind: "not_found" } | { kind: "status"; status: string } | { kind: "error" };

async function asaasPaymentGet(
  apiUrl: string,
  apiKey: string,
  paymentId: string,
): Promise<AsaasGetPay> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", access_token: apiKey },
  });
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) return { kind: "error" };
  try {
    const j = (await res.json()) as { status?: string };
    const status = typeof j.status === "string" ? j.status : "";
    return { kind: "status", status };
  } catch {
    return { kind: "error" };
  }
}

async function asaasDeletePayment(apiUrl: string, apiKey: string, paymentId: string): Promise<boolean> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/payments/${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
    headers: { access_token: apiKey },
  });
  return res.ok || res.status === 404;
}

function cronSecretsMatch(expected: string, received: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(received);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Use GET ou POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: "SUPABASE_URL / SERVICE_ROLE ausentes." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = (req.headers.get("Authorization") || "").trim();
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const cronSecretEnv = (Deno.env.get("EXPIRE_PENDING_PIX_CRON_SECRET") || "").trim();
  const cronHeader = (req.headers.get("x-expire-pix-cron") || "").trim();
  const serviceRoleOk = bearer.length > 0 && bearer === serviceKey;
  const cronOk =
    cronSecretEnv.length >= 16 &&
    cronHeader.length > 0 &&
    cronSecretsMatch(cronSecretEnv, cronHeader);
  if (!serviceRoleOk && !cronOk) {
    return new Response(JSON.stringify({ ok: false, error: "Não autorizado." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const asaas = await resolveAsaasRuntimeConfig(admin);
  if (!asaas) {
    return new Response(JSON.stringify({ ok: false, error: "Asaas API key indisponível." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cutoffIso = new Date(Date.now() - PIX_PENDING_EXPIRY_MS).toISOString();

  const [{ data: apts, error: aptErr }, { data: ords, error: ordErr }] = await Promise.all([
    admin
      .from("appointments")
      .select("id, asaas_payment_id, created_at")
      .eq("status", "PENDING")
      .not("asaas_payment_id", "is", null)
      .lt("created_at", cutoffIso)
      .limit(MAX_ROWS_PER_RUN),
    admin
      .from("orders")
      .select("id, asaas_payment_id, created_at")
      .eq("status", "PENDING")
      .not("asaas_payment_id", "is", null)
      .lt("created_at", cutoffIso)
      .limit(MAX_ROWS_PER_RUN),
  ]);

  if (aptErr || ordErr) {
    console.error("[expire-pending-pix] query", aptErr?.message, ordErr?.message);
    return new Response(
      JSON.stringify({ ok: false, error: aptErr?.message || ordErr?.message || "Falha ao listar pendentes." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let appointmentsExpired = 0;
  let ordersExpired = 0;
  const errors: string[] = [];

  type Row = { id: string; asaas_payment_id: string };

  async function expireRow(
    table: "appointments" | "orders",
    row: Row,
    onOk: () => void,
  ): Promise<void> {
    const payId = String(row.asaas_payment_id ?? "").trim();
    if (!payId) return;

    const got = await asaasPaymentGet(asaas.apiUrl, asaas.apiKey, payId);
    if (got.kind === "error") {
      errors.push(`${table} ${row.id} pay=${payId}: não foi possível consultar status no Asaas`);
      return;
    }
    if (got.kind === "not_found") {
      /* cobrança já removida no Asaas: só alinha BD */
    } else if (isPaidAsaasStatus(got.status)) {
      return;
    } else {
      const deleted = await asaasDeletePayment(asaas.apiUrl, asaas.apiKey, payId);
      if (!deleted) {
        errors.push(`${table} ${row.id} pay=${payId}: falha ao apagar no Asaas`);
        return;
      }
    }

    const patch = {
      status: "CANCELLED" as const,
      asaas_payment_id: null as string | null,
      payment_idempotency_key: null as string | null,
    };

    const { error } = await admin.from(table).update(patch).eq("id", row.id).eq("status", "PENDING");
    if (error) errors.push(`${table} ${row.id}: ${error.message}`);
    else onOk();
  }

  for (const raw of (apts || []) as Row[]) {
    await expireRow("appointments", raw, () => {
      appointmentsExpired += 1;
    });
  }
  for (const raw of (ords || []) as Row[]) {
    await expireRow("orders", raw, () => {
      ordersExpired += 1;
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      cutoffIso,
      mode: asaas.mode,
      scanned: { appointments: (apts || []).length, orders: (ords || []).length },
      expired: { appointments: appointmentsExpired, orders: ordersExpired },
      errors: errors.length ? errors.slice(0, 10) : undefined,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
