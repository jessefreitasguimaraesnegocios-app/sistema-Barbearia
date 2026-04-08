// Supabase Edge Function: asaas-webhook
// 1) Pagamentos (PIX cliente): PAYMENT_RECEIVED / PAYMENT_CONFIRMED → appointments/orders PAID
// 2) Mensalidade plataforma: pagamento ligado a subscription OU eventos SUBSCRIPTION_* → subscription_active na shops
// Requer verify_jwt = false e header asaas-access-token = ASAAS_WEBHOOK_TOKEN

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMENT_CONFIRMED_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
const SUBSCRIPTION_OFF_EVENTS = ["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"];
const ASAAS_API_URL = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");

type AsaasPayload = {
  event?: string;
  payment?: { id?: string; subscription?: string | { id?: string } };
  subscription?: { id?: string; status?: string };
};

function unauthorized(message: string, hint?: string) {
  const body: Record<string, unknown> = { code: 401, message };
  if (hint) body.hint = hint;
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
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

async function tokensMatch(expected: string, received: string): Promise<boolean> {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(received);
  if (a.length !== b.length) return false;
  return await crypto.subtle.timingSafeEqual(a, b);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, asaas-access-token, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ received: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!webhookToken || String(webhookToken).trim() === "") {
    return new Response(JSON.stringify({ code: 500, message: "ASAAS_WEBHOOK_TOKEN not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const expected = webhookToken.trim();
  const receivedToken = readIncomingWebhookToken(req);
  const ok = receivedToken !== "" && (await tokensMatch(expected, receivedToken));
  if (!ok) {
    return unauthorized(
      "Missing or invalid asaas-access-token",
      "No Asaas: Integrações → Webhooks → edite este webhook e defina o Token de autenticação (ou use Gerar token). " +
        "No Supabase: Edge Functions → Secrets → ASAAS_WEBHOOK_TOKEN com o MESMO valor. Sem espaços a mais.",
    );
  }

  let payload: AsaasPayload = {};
  try {
    payload = (await req.json()) as AsaasPayload;
  } catch {
    return new Response(JSON.stringify({ received: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = String(payload?.event ?? "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[asaas-webhook] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const asaasApiKey = Deno.env.get("ASAAS_API_KEY");

  /** Cobrança removida no Asaas: desvincula PIX pendente para o cliente poder gerar outro. */
  if (event === "PAYMENT_DELETED") {
    try {
      const delPaymentId = payload?.payment?.id != null ? String(payload.payment.id).trim() : "";
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
    return new Response(JSON.stringify({ received: true, event: "PAYMENT_DELETED" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  /** Assinatura cancelada / inativa no Asaas → desliga acesso na plataforma */
  if (SUBSCRIPTION_OFF_EVENTS.includes(event)) {
    const subId = extractSubscriptionId(payload?.subscription);
    if (subId) {
      const { data: rec, error: recErr } = await supabase
        .from("asaas_subscription_webhook_receipts")
        .upsert({ event: String(event), subscription_id: subId }, { onConflict: "event,subscription_id", ignoreDuplicates: true })
        .select("event, subscription_id");
      if (recErr) {
        console.error("[asaas-webhook] subscription receipt error:", recErr.message);
        return new Response(
          JSON.stringify({ received: true, note: "subscription_receipt_failed", detail: recErr.message }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
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
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const paymentId = payload?.payment?.id;
  if (!PAYMENT_CONFIRMED_EVENTS.includes(event) || !paymentId) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: receiptData, error: receiptErr } = await supabase
    .from("asaas_webhook_receipts")
    .upsert(
      { event: String(event), payment_id: String(paymentId) },
      { onConflict: "event,payment_id", ignoreDuplicates: true }
    )
    .select("event, payment_id");
  if (receiptErr) {
    console.error("[asaas-webhook] receipt error:", receiptErr.message);
    // 200: não pausar fila Asaas; investigar via logs / BD.
    return new Response(
      JSON.stringify({ received: true, note: "receipt_persist_failed", detail: receiptErr.message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  if (!receiptData || receiptData.length === 0) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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

    let paymentDetail: { externalReference?: string | null; subscription?: string | { id?: string } } | null = null;
    if (asaasApiKey) {
      const paymentRes = await fetch(`${ASAAS_API_URL}/payments/${paymentId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
      });
      if (paymentRes.ok) {
        paymentDetail = (await paymentRes.json()) as {
          externalReference?: string | null;
          subscription?: string | { id?: string };
        };
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
    // 200 evita fila pausada no Asaas; detalhe fica nos logs da função.
    return new Response(
      JSON.stringify({ received: true, note: "payment_handler_error_logged" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
