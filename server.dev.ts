/**
 * Servidor de desenvolvimento para as rotas /api/*.
 * Com "npm run dev", o Vite faz proxy de /api para este servidor.
 * Em produção (Vercel), as rotas api/* são serverless e este arquivo não é usado.
 *
 * Rode `npm run dev:all` (vite + esta API) para o painel admin local funcionar
 * (`/api/admin/runtime-mode`, create-shop, wallet, etc.).
 */
import './lib/server/loadDevEnv.ts';
import express from 'express';
import type { Request } from 'express';
import onboardingHandler from './api/partner/onboarding.ts';
import walletHandler from './api/partner/wallet.ts';
import processShopFinanceHandler from './api/admin/process-shop-finance.ts';
import staffCreateAccessHandler from './api/partner/staff/create-access.ts';
import runtimeModeHandler from './api/admin/runtime-mode.ts';
import createShopHandler from './api/admin/create-shop.ts';
import adminWalletHandler from './api/admin/wallet.ts';
import deleteShopHandler from './api/admin/shops/[id].ts';
import shopSubscriptionHandler from './api/admin/shops/[id]/subscription.ts';

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

app.post('/api/partner/staff/create-access', async (req, res) => {
  try {
    (req as { body?: unknown }).body = req.body;
    await staffCreateAccessHandler(req as never, res as never);
  } catch (e) {
    console.error('[dev-api] staff/create-access', e);
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

/** Repassa Request do Express para handlers no estilo Vercel (`api/*.ts`). */
function vercelLikeReq(req: Request) {
  const q = req.query as Record<string, string | string[] | undefined>;
  return {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
    url: req.originalUrl || req.url,
    query: q,
  };
}

app.get('/api/admin/runtime-mode', async (req, res) => {
  try {
    await runtimeModeHandler(vercelLikeReq(req), res as never);
  } catch (e) {
    console.error('[dev-api] runtime-mode GET', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.patch('/api/admin/runtime-mode', async (req, res) => {
  try {
    await runtimeModeHandler(vercelLikeReq(req), res as never);
  } catch (e) {
    console.error('[dev-api] runtime-mode PATCH', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.post('/api/admin/create-shop', async (req, res) => {
  try {
    await createShopHandler(vercelLikeReq(req), res as never);
  } catch (e) {
    console.error('[dev-api] create-shop', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.get('/api/admin/wallet', async (req, res) => {
  try {
    await adminWalletHandler(vercelLikeReq(req), res as never);
  } catch (e) {
    console.error('[dev-api] admin wallet GET', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.post('/api/admin/wallet', async (req, res) => {
  try {
    await adminWalletHandler(vercelLikeReq(req), res as never);
  } catch (e) {
    console.error('[dev-api] admin wallet POST', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.delete('/api/admin/shops/:shopId', async (req, res) => {
  try {
    const base = vercelLikeReq(req);
    await deleteShopHandler(
      {
        ...base,
        query: { ...base.query, id: req.params.shopId },
      },
      res as never,
    );
  } catch (e) {
    console.error('[dev-api] admin shops DELETE', e);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Erro interno na API.',
      });
    }
  }
});

app.patch('/api/admin/shops/:shopId/subscription', async (req, res) => {
  try {
    const base = vercelLikeReq(req);
    await shopSubscriptionHandler(
      {
        ...base,
        query: { ...base.query, id: req.params.shopId },
      },
      res as never,
    );
  } catch (e) {
    console.error('[dev-api] admin shops subscription PATCH', e);
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
