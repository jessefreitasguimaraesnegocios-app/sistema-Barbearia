import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Admin: Create Shop and Asaas Sub-account
  app.post("/api/admin/shops/create", async (req, res) => {
    const { name, cnpjCpf, email, phone, pixKey, type } = req.body;

    if (!process.env.ASAAS_API_KEY) {
      return res.status(500).json({ error: "ASAAS_API_KEY not configured" });
    }

    try {
      // 1. Create Sub-account in Asaas
      // Documentation: https://docs.asaas.com/reference/criar-subconta
      const subAccountData = {
        name: name,
        email: email,
        cpfCnpj: cnpjCpf,
        phone: phone,
        mobilePhone: phone,
        address: "Rua Exemplo", // In a real app, get this from the form
        addressNumber: "123",
        province: "Centro",
        postalCode: "01234567",
        city: "São Paulo",
        state: "SP",
        country: "Brasil"
      };

      /* Real API Call
      const asaasResponse = await axios.post(`${process.env.ASAAS_API_URL}/accounts`, subAccountData, {
        headers: { 'access_token': process.env.ASAAS_API_KEY }
      });
      const subAccount = asaasResponse.data;
      */

      // Mock response for demo
      const mockSubAccount = {
        id: `acc_${Math.random().toString(36).substr(2, 9)}`,
        apiKey: `ak_${Math.random().toString(36).substr(2, 15)}`,
        walletId: `wal_${Math.random().toString(36).substr(2, 9)}`
      };

      // 2. Save to Supabase
      const { data: shopData, error: dbError } = await supabase
        .from('shops')
        .insert([{
          name,
          type,
          cnpj_cpf: cnpjCpf,
          email,
          phone,
          pix_key: pixKey,
          asaas_account_id: mockSubAccount.id,
          asaas_api_key: mockSubAccount.apiKey,
          asaas_wallet_id: mockSubAccount.walletId,
          subscription_active: true,
          rating: 5.0,
          profile_image: 'https://picsum.photos/400?random=' + Math.floor(Math.random() * 100),
          banner_image: 'https://picsum.photos/800/400?random=' + Math.floor(Math.random() * 100),
          address: 'Endereço a definir'
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      res.json({
        success: true,
        message: "Subconta Asaas criada e barbearia cadastrada no Supabase!",
        shop: shopData
      });

    } catch (error: any) {
      console.error("Asaas Sub-account Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to create sub-account", details: error.response?.data });
    }
  });

  // Asaas Payment Split Endpoint
  app.post("/api/payments/create", async (req, res) => {
    const { amount, tip = 0, shopWalletId, description, customerName, customerEmail } = req.body;

    if (!process.env.ASAAS_API_KEY) {
      return res.status(500).json({ error: "ASAAS_API_KEY not configured" });
    }

    try {
      // Split logic: 5% for platform (main account), 95% for shop (sub-account)
      // Tip goes 100% to the shop
      const platformSharePercent = 5;
      
      const baseAmount = amount - tip;
      const platformAmount = (baseAmount * platformSharePercent) / 100;
      const shopAmount = (baseAmount - platformAmount) + tip;

      const paymentData = {
        customer: "cus_000005041334", // In real app, create/find customer first
        billingType: "PIX",
        value: amount,
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        description: description,
        split: [
          {
            walletId: shopWalletId, // The sub-account's wallet ID
            fixedValue: shopAmount, // 95% goes to the barbershop
            // The remaining 5% stays in the main account (platform owner)
          }
        ]
      };

      /* Real API Call
      const response = await axios.post(`${process.env.ASAAS_API_URL}/payments`, paymentData, {
        headers: { 'access_token': process.env.ASAAS_API_KEY }
      });
      res.json(response.data);
      */

      res.json({
        success: true,
        message: "Cobrança com Split configurada: 5% Plataforma / 95% Barbearia",
        details: {
          total: amount,
          platformShare: platformAmount,
          shopShare: shopAmount,
          shopWalletId: shopWalletId
        },
        paymentUrl: "https://sandbox.asaas.com/checkout/mock",
        pixCode: "00020126360014BR.GOV.BCB.PIX0114+551199999999952040000530398654041.005802BR5913Mock Payment6009SAO PAULO62070503***6304E2B4"
      });

    } catch (error: any) {
      console.error("Asaas Payment Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to create payment", details: error.response?.data });
    }
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
