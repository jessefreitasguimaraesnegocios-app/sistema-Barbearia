// Supabase Edge Function: asaas-webhook
// Recebe eventos do Asaas (PAYMENT_RECEIVED etc.) e atualiza status de agendamentos e pedidos para PAID
// Requer verify_jwt = false (config ou --no-verify-jwt no deploy) e validação via header asaas-access-token

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMENT_CONFIRMED_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
const ASAAS_API_URL = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");

function unauthorized(message: string) {
  return new Response(JSON.stringify({ code: 401, message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, asaas-access-token",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ received: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validação do token do webhook Asaas (header asaas-access-token)
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!webhookToken || String(webhookToken).trim() === "") {
    return new Response(JSON.stringify({ code: 500, message: "ASAAS_WEBHOOK_TOKEN not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const receivedToken = req.headers.get("asaas-access-token")?.trim() ?? "";
  if (receivedToken === "" || receivedToken !== webhookToken.trim()) {
    return unauthorized("Missing or invalid asaas-access-token");
  }

  let payload: { event?: string; payment?: { id?: string } } = {};
  try {
    payload = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ received: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = payload?.event;
  const paymentId = payload?.payment?.id;

  if (!PAYMENT_CONFIRMED_EVENTS.includes(event) || !paymentId) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  const { data: receiptData, error: receiptErr } = await supabase
    .from("asaas_webhook_receipts")
    .upsert(
      { event: String(event), payment_id: String(paymentId) },
      { onConflict: "event,payment_id", ignoreDuplicates: true }
    )
    .select("event, payment_id");
  if (receiptErr) {
    console.error("[asaas-webhook] receipt error:", receiptErr.message);
    return new Response(JSON.stringify({ received: false, error: "Webhook receipt persistence failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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

    if (!aptUpdated && !ordUpdated && asaasApiKey) {
      const paymentRes = await fetch(`${ASAAS_API_URL}/payments/${paymentId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", access_token: asaasApiKey },
      });
      if (paymentRes.ok) {
        const payment = (await paymentRes.json()) as { externalReference?: string | null };
        const extRef = payment?.externalReference != null ? String(payment.externalReference).trim() : "";
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
    }
  } catch (e) {
    console.error("[asaas-webhook]", e);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
