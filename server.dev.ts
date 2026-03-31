/**
 * Servidor de desenvolvimento para as rotas /api/*.
 * Com "npm run dev", o Vite faz proxy de /api para este servidor.
 * Em produção (Vercel), as rotas api/* são serverless e este arquivo não é usado.
 */
import 'dotenv/config';
import express from 'express';
import onboardingHandler from './api/partner/onboarding.ts';
import walletHandler from './api/partner/wallet.ts';
import processShopFinanceHandler from './api/admin/process-shop-finance.ts';

const app = express();
app.use(express.json());

const PORT = Number(process.env.DEV_API_PORT) || 3001;

app.get('/api/partner/onboarding', async (req, res) => {
  try {
    await onboardingHandler(req, res);
  } catch (e) {
    console.error('[dev-api] onboarding', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.get('/api/partner/wallet', async (req, res) => {
  try {
    await walletHandler(req, res);
  } catch (e) {
    console.error('[dev-api] wallet GET', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});
app.post('/api/partner/wallet', async (req, res) => {
  try {
    (req as any).body = req.body;
    await walletHandler(req as any, res);
  } catch (e) {
    console.error('[dev-api] wallet POST', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.post('/api/admin/process-shop-finance', async (req, res) => {
  try {
    await processShopFinanceHandler(req as any, res as any);
  } catch (e) {
    console.error('[dev-api] process-shop-finance', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`[dev-api] API rodando em http://localhost:${PORT}`);
});
