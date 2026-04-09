// Supabase Edge Function: asaas-webhook
// 1) Pagamentos (PIX cliente): PAYMENT_RECEIVED / PAYMENT_CONFIRMED → appointments/orders PAID
// 2) Mensalidade plataforma: pagamento ligado a subscription OU eventos SUBSCRIPTION_* → subscription_active na shops
// Requer verify_jwt = false e header asaas-access-token = ASAAS_WEBHOOK_TOKEN
//
// Importante: qualquer erro não tratado vira 500 genérico no Asaas. O handler principal devolve 200 sempre
// que possível para não pausar a fila de webhooks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readAsaasApiKey, readAsaasBaseUrl } from "../_shared/asaasEnv.ts";
type RuntimeMode = "production" | "sandbox";

const PAYMENT_CONFIRMED_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
const SUBSCRIPTION_OFF_EVENTS = ["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"];
/** Sem lógica de negócio: só 200 para o Asaas não travar a fila. */
const IGNORE_EVENTS = new Set<string>([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
]);
/** Variantes / eventos de cobrança apagada (Asaas pode enviar só PAYMENT_DELETED). */
const PAYMENT_DELETED_LIKE = new Set<string>(["PAYMENT_DELETED", "PAYMENT_REMOVED", "PAYMENT_DELETED_BY"]);

async function tokensMatch(expected: string, received: string): Promise<boolean> {
  try {
    const a = new TextEncoder().encode(expected);
    const b = new TextEncoder().encode(received);
    if (a.length !== b.length) return false;
    return await crypto.subtle.timingSafeEqual(a, b);
  } catch (e) {
    console.error("[asaas-webhook] tokensMatch error:", e);
    return false;
  }
}

type WebhookRuntime = { mode: RuntimeMode; apiKey: string; apiUrl: string };

/**
 * Webhook ≠ toggle do admin: produção pode receber fila sandbox (Asaas_Hmlg) e vice-versa.
 * Aceita o token que bater (sandbox ou produção), com ordem por User-Agent.
 */
async function resolveWebhookRuntime(
  req: Request,
  receivedToken: string,
): Promise<{ ok: true; runtime: WebhookRuntime } | { ok: false; reason: "no_secrets" | "bad_token" }> {
  const sandTok = readAsaasApiKey("ASAAS_WEBHOOK_TOKEN_SANDBOX");
  const prodTok = readAsaasApiKey("ASAAS_WEBHOOK_TOKEN");
  if (!sandTok.trim() && !prodTok.trim()) {
    return { ok: false, reason: "no_secrets" };
  }

  const defaultProdUrl = "https://api.asaas.com/v3";
  const defaultSandboxUrl = "https://api-sandbox.asaas.com/v3";
  const sandKey = readAsaasApiKey("ASAAS_API_KEY_SANDBOX", "ASAAS_API_KEY");
  const sandUrl = readAsaasBaseUrl(["ASAAS_API_URL_SANDBOX", "ASAAS_API_URL"], defaultSandboxUrl);
  const prodKey = readAsaasApiKey("ASAAS_API_KEY");
  const prodUrl = readAsaasBaseUrl(["ASAAS_API_URL"], defaultProdUrl);

  type Row = { mode: RuntimeMode; tok: string; apiKey: string; apiUrl: string };
  const rows: Row[] = [];
  if (sandTok.trim()) rows.push({ mode: "sandbox", tok: sandTok.trim(), apiKey: sandKey, apiUrl: sandUrl });
  if (prodTok.trim()) rows.push({ mode: "production", tok: prodTok.trim(), apiKey: prodKey, apiUrl: prodUrl });

  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const sandboxFirst = ua.includes("hmlg") || ua.includes("sandbox");

  const ordered = sandboxFirst
    ? [...rows.filter((r) => r.mode === "sandbox"), ...rows.filter((r) => r.mode === "production")]
    : [...rows.filter((r) => r.mode === "production"), ...rows.filter((r) => r.mode === "sandbox")];

  for (const r of ordered) {
    if (await tokensMatch(r.tok, receivedToken)) {
      return { ok: true, runtime: { mode: r.mode, apiKey: r.apiKey, apiUrl: r.apiUrl } };
    }
  }
  return { ok: false, reason: "bad_token" };
}

function normalizeEventName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase();
}

type AsaasPayload = {
  event?: string;
  payment?: { id?: string; deleted?: boolean; subscription?: string | { id?: string } };
  subscription?: { id?: string; status?: string };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(message: string, hint?: string) {
  const body: Record<string, unknown> = { code: 401, message };
  if (hint) body.hint = hint;
  return jsonResponse(body, 401);
}

/** Token que o Asaas envia em `asaas-access-token` (ou Bearer no Authorization, se alguém configurar assim). */
function readIncomingWebhookToken(req: Request): string {
  const direct = req.headers.get("asaas-access-token")?.trim();
  if (direct) return direct;
  const auth = req.headers.get("authorization")?.trim();
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  return "";
}

function extractSubscriptionId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function extractPaymentId(payload: AsaasPayload): string {
  const raw = payload?.payment?.id;
  if (raw == null) return "";
  return String(raw).trim();
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, asaas-access-token, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ received: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[asaas-webhook] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return jsonResponse({ received: true, note: "supabase_env_missing" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const receivedToken = readIncomingWebhookToken(req);

  const auth = await resolveWebhookRuntime(req, receivedToken);
  if (auth.ok === false && auth.reason === "no_secrets") {
    console.error("[asaas-webhook] ASAAS_WEBHOOK_TOKEN / _SANDBOX não configurados");
    return jsonResponse({ received: true, note: "ASAAS_WEBHOOK_TOKEN not configured" });
  }
  if (receivedToken === "") {
    return unauthorized(
      "Missing or invalid asaas-access-token",
      "O Asaas não enviou o header asaas-access-token. No painel Asaas (Integrações → Webhooks), defina o " +
        "Token de autenticação igual a ASAAS_WEBHOOK_TOKEN_SANDBOX (homologação) ou ASAAS_WEBHOOK_TOKEN (produção) no Supabase.",
    );
  }
  if (auth.ok === false && auth.reason === "bad_token") {
    return unauthorized(
      "Missing or invalid asaas-access-token",
      "O token do webhook não bate com nenhum secret. Supabase → Secrets: ASAAS_WEBHOOK_TOKEN_SANDBOX (sandbox / Asaas_Hmlg) " +
        "e/ou ASAAS_WEBHOOK_TOKEN (produção), com o MESMO valor do campo Token no webhook Asaas. Sem espaços a mais.",
    );
  }
  const runtime = auth.runtime;

  let payload: AsaasPayload = {};
  try {
    payload = (await req.json()) as AsaasPayload;
  } catch {
    return jsonResponse({ received: false, error: "Invalid JSON" }, 400);
  }

  const eventKey = normalizeEventName(payload?.event);
  const paymentIdEarly = extractPaymentId(payload);
  console.log("[asaas-webhook] mode=", runtime.mode, "event=", eventKey, "paymentId=", paymentIdEarly || "(none)");

  /** Cobrança removida no Asaas: desvincula PIX pendente para o cliente poder gerar outro. */
  if (PAYMENT_DELETED_LIKE.has(eventKey)) {
    try {
      const delPaymentId = paymentIdEarly;
      if (delPaymentId) {
        const [aptDel, ordDel] = await Promise.all([
          supabase
            .from("appointments")
            .update({ asaas_payment_id: null, payment_idempotency_key: null })
            .eq("asaas_payment_id", delPaymentId)
            .eq("status", "PENDING"),
          supabase
            .from("orders")
            .update({ asaas_payment_id: null, payment_idempotency_key: null })
            .eq("asaas_payment_id", delPaymentId)
            .eq("status", "PENDING"),
        ]);
        if (aptDel.error) console.error("[asaas-webhook] PAYMENT_DELETED appointments:", aptDel.error.message);
        if (ordDel.error) console.error("[asaas-webhook] PAYMENT_DELETED orders:", ordDel.error.message);
      }
    } catch (e) {
      console.error("[asaas-webhook] PAYMENT_DELETED handler:", e);
    }
    return jsonResponse({ received: true, event: eventKey || "PAYMENT_DELETED_LIKE" });
  }

  if (IGNORE_EVENTS.has(eventKey)) {
    return jsonResponse({ received: true, ignored: true, event: eventKey });
  }

  /** Assinatura cancelada / inativa no Asaas → desliga acesso na plataforma */
  if (SUBSCRIPTION_OFF_EVENTS.includes(eventKey)) {
    const subId = extractSubscriptionId(payload?.subscription);
    if (subId) {
      const { data: rec, error: recErr } = await supabase
        .from("asaas_subscription_webhook_receipts")
        .upsert({ event: eventKey, subscription_id: subId }, { onConflict: "event,subscription_id", ignoreDuplicates: true })
        .select("event, subscription_id");
      if (recErr) {
        console.error("[asaas-webhook] subscription receipt error:", recErr.message);
        return jsonResponse({ received: true, note: "subscription_receipt_failed", detail: recErr.message });
      }
      if (rec && rec.length > 0) {
        const { data: shops, error: upErr } = await supabase
          .from("shops")
          .update({ subscription_active: false })
          .eq("asaas_platform_subscription_id", subId)
          .select("id");
        if (upErr) console.error("[asaas-webhook] shop deactivate:", upErr.message);
        else if (shops?.length) console.log("[asaas-webhook] subscription_active=false for shop(s):", shops.map((s: { id: string }) => s.id));
      }
    }
    return jsonResponse({ received: true });
  }

  const paymentId = payload?.payment?.id;
  if (!PAYMENT_CONFIRMED_EVENTS.includes(eventKey) || !paymentId) {
    return jsonResponse({ received: true });
  }

  const { data: receiptData, error: receiptErr } = await supabase
    .from("asaas_webhook_receipts")
    .upsert(
      { event: eventKey, payment_id: String(paymentId) },
      { onConflict: "event,payment_id", ignoreDuplicates: true }
    )
    .select("event, payment_id");
  if (receiptErr) {
    console.error("[asaas-webhook] receipt error:", receiptErr.message);
    return jsonResponse({ received: true, note: "receipt_persist_failed", detail: receiptErr.message });
  }
  if (!receiptData || receiptData.length === 0) {
    return jsonResponse({ received: true, duplicate: true });
  }

  const updatedCount = (rows: unknown[] | null | undefined) => (rows ? rows.length : 0);

  try {
    const [aptRes, ordRes] = await Promise.all([
      supabase.from("appointments").update({ status: "PAID" }).eq("asaas_payment_id", paymentId).select("id"),
      supabase.from("orders").update({ status: "PAID" }).eq("asaas_payment_id", paymentId).select("id"),
    ]);
    const aptUpdated = updatedCount(aptRes.data as unknown[] | null | undefined);
    const ordUpdated = updatedCount(ordRes.data as unknown[] | null | undefined);
    if (aptUpdated) {
      console.log("[asaas-webhook] Appointment(s) marked PAID:", aptRes.data?.map((r: { id: string }) => r.id));
    }
    if (ordUpdated) {
      console.log("[asaas-webhook] Order(s) marked PAID:", ordRes.data?.map((r: { id: string }) => r.id));
    }

    let paymentDetail: { externalReference?: string | null; subscription?: string | { id?: string }; deleted?: boolean } | null = null;
    if (runtime.apiKey) {
      try {
        const paymentRes = await fetch(`${runtime.apiUrl}/payments/${paymentId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SmartCria-Barbearia/1.0",
            access_token: runtime.apiKey,
          },
        });
        if (paymentRes.ok) {
          paymentDetail = (await paymentRes.json()) as {
            externalReference?: string | null;
            subscription?: string | { id?: string };
            deleted?: boolean;
          };
        }
      } catch (fetchErr) {
        console.error("[asaas-webhook] GET payment Asaas:", fetchErr);
      }
    }

    if (!aptUpdated && !ordUpdated && paymentDetail) {
      const extRef = paymentDetail.externalReference != null ? String(paymentDetail.externalReference).trim() : "";
      if (extRef.includes(":")) {
        const [recordType, ...rest] = extRef.split(":");
        const idempotencyKey = rest.join(":").trim();
        if (idempotencyKey) {
          if (recordType === "booking") {
            const { data: recApt } = await supabase
              .from("appointments")
              .update({ status: "PAID", asaas_payment_id: paymentId })
              .eq("payment_idempotency_key", idempotencyKey)
              .neq("status", "CANCELLED")
              .select("id");
            if (updatedCount(recApt as unknown[] | null | undefined)) {
              console.log("[asaas-webhook] Reconciled booking by idempotency:", idempotencyKey);
            }
          } else if (recordType === "order") {
            const { data: recOrd } = await supabase
              .from("orders")
              .update({ status: "PAID", asaas_payment_id: paymentId })
              .eq("payment_idempotency_key", idempotencyKey)
              .select("id");
            if (updatedCount(recOrd as unknown[] | null | undefined)) {
              console.log("[asaas-webhook] Reconciled order by idempotency:", idempotencyKey);
            }
          }
        }
      }
    }

    const subId =
      extractSubscriptionId(payload?.payment?.subscription) ??
      extractSubscriptionId(paymentDetail?.subscription);
    if (subId) {
      const { data: subShops, error: subErr } = await supabase
        .from("shops")
        .update({ subscription_active: true })
        .eq("asaas_platform_subscription_id", subId)
        .select("id");
      if (subErr) console.error("[asaas-webhook] platform subscription sync:", subErr.message);
      else if (subShops?.length) {
        console.log("[asaas-webhook] subscription_active=true for platform subscription:", subId, subShops.map((s: { id: string }) => s.id));
      }
    }
  } catch (e) {
    console.error("[asaas-webhook] payment handler error:", e);
    return jsonResponse({ received: true, note: "payment_handler_error_logged" });
  }

  return jsonResponse({ received: true });
}

Deno.serve(async (req: Request) => {
  try {
    return await handleWebhook(req);
  } catch (e) {
    console.error("[asaas-webhook] FATAL (outer catch):", e);
    return jsonResponse({
      received: true,
      note: "fatal_outer_catch",
      detail: e instanceof Error ? e.message : String(e).slice(0, 300),
    });
  }
});
