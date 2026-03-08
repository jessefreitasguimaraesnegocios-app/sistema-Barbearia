// Supabase Edge Function: asaas-webhook
// Recebe eventos do Asaas (PAYMENT_RECEIVED etc.) e atualiza status de agendamentos e pedidos para PAID
// Requer verify_jwt = false (config ou --no-verify-jwt no deploy) e validação via header asaas-access-token

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMENT_CONFIRMED_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];

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
  if (webhookToken && String(webhookToken).trim() !== "") {
    const receivedToken = req.headers.get("asaas-access-token")?.trim() ?? "";
    if (receivedToken === "" || receivedToken !== webhookToken.trim()) {
      return unauthorized("Missing or invalid asaas-access-token");
    }
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

  try {
    const [aptRes, ordRes] = await Promise.all([
      supabase.from("appointments").update({ status: "PAID" }).eq("asaas_payment_id", paymentId).select("id"),
      supabase.from("orders").update({ status: "PAID" }).eq("asaas_payment_id", paymentId).select("id"),
    ]);
    if (aptRes.count ?? aptRes.data?.length) {
      console.log("[asaas-webhook] Appointment(s) marked PAID:", aptRes.data?.map((r: { id: string }) => r.id));
    }
    if (ordRes.count ?? ordRes.data?.length) {
      console.log("[asaas-webhook] Order(s) marked PAID:", ordRes.data?.map((r: { id: string }) => r.id));
    }
  } catch (e) {
    console.error("[asaas-webhook]", e);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
