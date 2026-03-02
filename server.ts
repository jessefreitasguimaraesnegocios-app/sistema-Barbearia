import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase =
  process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Admin: Create Shop and Asaas Sub-account
  app.post("/api/admin/shops/create", async (req, res) => {
    const {
      name,
      cnpjCpf,
      email,
      phone,
      pixKey,
      type,
      address = "Rua Exemplo",
      addressNumber = "S/N",
      province = "Centro",
      postalCode = "01310100",
      incomeValue = 5000,
      subscriptionAmount = 99
    } = req.body;

    if (!supabase) {
      return res.status(500).json({ error: "Supabase not configured. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env" });
    }
    if (!process.env.ASAAS_API_KEY) {
      return res.status(500).json({ error: "ASAAS_API_KEY not configured" });
    }

    const asaasBaseUrl = (process.env.ASAAS_API_URL || "https://sandbox.asaas.com/api/v3").replace(/\/$/, "");

    try {
      // 1. Create Sub-account in Asaas (real API)
      // https://docs.asaas.com/reference/criar-subconta
      const subAccountData = {
        name,
        email,
        cpfCnpj: (cnpjCpf || "").replace(/\D/g, ""),
        phone: phone || "",
        mobilePhone: phone || "",
        incomeValue: Number(incomeValue) || 5000,
        address,
        addressNumber,
        province,
        postalCode: (postalCode || "01310100").replace(/\D/g, "").slice(0, 8)
      };

      let subAccount: { id: string; apiKey?: string; walletId?: string };
      try {
        const asaasResponse = await axios.post(`${asaasBaseUrl}/accounts`, subAccountData, {
          headers: { access_token: process.env.ASAAS_API_KEY }
        });
        subAccount = asaasResponse.data;
        if (!subAccount.id || !subAccount.walletId) {
          throw new Error("Resposta Asaas sem id ou walletId");
        }
      } catch (asaasErr: any) {
        const msg = asaasErr.response?.data?.errors?.[0]?.description || asaasErr.message;
        console.error("Asaas Sub-account API Error:", asaasErr.response?.data || asaasErr.message);
        return res.status(400).json({
          error: "Falha ao criar subconta Asaas",
          details: msg
        });
      }

      // 2. Save to Supabase
      const { data: shopData, error: dbError } = await supabase
        .from('shops')
        .insert([{
          name,
          type: type || 'BARBER',
          cnpj_cpf: cnpjCpf,
          email,
          phone,
          pix_key: pixKey,
          asaas_account_id: subAccount.id,
          asaas_api_key: subAccount.apiKey || null,
          asaas_wallet_id: subAccount.walletId,
          subscription_active: true,
          subscription_amount: Math.max(0, Number(subscriptionAmount) || 99),
          rating: 5.0,
          profile_image: 'https://picsum.photos/400?random=' + Math.floor(Math.random() * 100),
          banner_image: 'https://picsum.photos/800/400?random=' + Math.floor(Math.random() * 100),
          address: address
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      const shopForFront = {
        ...shopData,
        ownerId: shopData.owner_id,
        cnpjOrCpf: shopData.cnpj_cpf,
        pixKey: shopData.pix_key,
        profileImage: shopData.profile_image,
        bannerImage: shopData.banner_image,
        subscriptionActive: shopData.subscription_active,
        subscriptionAmount: shopData.subscription_amount != null ? Number(shopData.subscription_amount) : 99,
        asaasAccountId: shopData.asaas_account_id,
        asaasApiKey: shopData.asaas_api_key,
        asaasWalletId: shopData.asaas_wallet_id,
        services: [],
        professionals: [],
        products: []
      };

      res.json({
        success: true,
        message: "Subconta Asaas criada e barbearia cadastrada no Supabase!",
        shop: shopForFront
      });

    } catch (error: any) {
      console.error("Asaas Sub-account Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to create sub-account", details: error.response?.data || error.message });
    }
  });

  // Asaas Payment Split Endpoint
  app.post("/api/payments/create", async (req, res) => {
    const { amount, tip = 0, shopWalletId, description, customerName, customerEmail, customerId: bodyCustomerId } = req.body;

    if (!process.env.ASAAS_API_KEY) {
      return res.status(500).json({ error: "ASAAS_API_KEY not configured" });
    }

    const asaasBaseUrl = (process.env.ASAAS_API_URL || "https://sandbox.asaas.com/api/v3").replace(/\/$/, "");
    const headers = { access_token: process.env.ASAAS_API_KEY };

    try {
      // Split: 5% platform, 95% shop; tip 100% to shop
      const platformSharePercent = 5;
      const baseAmount = Number(amount) - Number(tip);
      const platformAmount = (baseAmount * platformSharePercent) / 100;
      const shopAmount = baseAmount - platformAmount + Number(tip);

      let customerId = bodyCustomerId;
      if (!customerId && (customerName || customerEmail)) {
        try {
          const custRes = await axios.post(
            `${asaasBaseUrl}/customers`,
            {
              name: customerName || "Cliente",
              email: customerEmail || undefined,
              cpfCnpj: "19540550000121",
              mobilePhone: "11999999999"
            },
            { headers }
          );
          customerId = custRes.data?.id;
        } catch (e) {
          console.warn("Create customer failed, using default:", e.response?.data);
        }
      }
      if (!customerId) {
        customerId = process.env.ASAAS_DEFAULT_CUSTOMER_ID || "cus_000005041334";
      }

      const paymentData = {
        customer: customerId,
        billingType: "PIX",
        value: Number(amount),
        dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        description: description || "Pagamento",
        split: [
          { walletId: shopWalletId, fixedValue: Number(shopAmount.toFixed(2)) }
        ]
      };

      const response = await axios.post(`${asaasBaseUrl}/payments`, paymentData, { headers });
      const payment = response.data;

      res.json({
        success: true,
        message: "Cobrança com Split configurada: 5% Plataforma / 95% Barbearia",
        details: {
          total: amount,
          platformShare: platformAmount,
          shopShare: shopAmount,
          shopWalletId
        },
        paymentUrl: payment.invoiceUrl || payment.bankSlipUrl,
        pixCode: payment.pixCode || payment.pixTransaction || null,
        id: payment.id,
        status: payment.status
      });
    } catch (error: any) {
      console.error("Asaas Payment Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to create payment",
        details: error.response?.data?.errors || error.response?.data || error.message
      });
    }
  });

  // Admin: Update shop subscription status (Suspender/Reativar) e/ou valor da mensalidade
  app.patch("/api/admin/shops/:id/subscription", async (req, res) => {
    const { id } = req.params;
    const { subscriptionActive, subscriptionAmount } = req.body;

    if (!supabase) {
      return res.status(500).json({ error: "Supabase not configured" });
    }

    const updates: Record<string, boolean | number> = {};
    if (typeof subscriptionActive === "boolean") updates.subscription_active = subscriptionActive;
    if (typeof subscriptionAmount === "number" && subscriptionAmount >= 0) updates.subscription_amount = subscriptionAmount;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Envie subscriptionActive (boolean) e/ou subscriptionAmount (number)" });
    }

    const { data, error } = await supabase
      .from("shops")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Update subscription error:", error);
      return res.status(500).json({ error: error.message });
    }

    const shopForFront = data ? {
      ...data,
      ownerId: data.owner_id,
      cnpjOrCpf: data.cnpj_cpf,
      pixKey: data.pix_key,
      profileImage: data.profile_image,
      bannerImage: data.banner_image,
      subscriptionActive: data.subscription_active,
      subscriptionAmount: data.subscription_amount != null ? Number(data.subscription_amount) : 99,
      asaasAccountId: data.asaas_account_id,
      asaasApiKey: data.asaas_api_key,
      asaasWalletId: data.asaas_wallet_id,
      services: [],
      professionals: [],
      products: []
    } : null;

    res.json({ success: true, shop: shopForFront });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
