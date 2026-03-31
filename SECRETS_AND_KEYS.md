# Chaves, secrets e onde configurar

Este guia lista variáveis usadas pelo **sistema-Barbearia**: onde obter cada valor e **onde colocá-lo** (nunca commite valores reais no Git).

---

## 1. Resumo rápido: três lugares típicos

| Onde | Uso |
|------|-----|
| **Arquivo `.env` na raiz (local)** | Vite + `npm run dev:api` / scripts `db:push`. Não versionar. |
| **Vercel → Project → Settings → Environment Variables** | Rotas em `api/*` em produção (`/api/admin/*`, `/api/partner/*`, `/api/payments/*`). |
| **Supabase → Project → Edge Functions → Secrets** | Funções: `create-shop`, `create-payment`, `process-shop-finance`, `shop-finance-webhook`, `asaas-webhook`. |

O front (browser) só enxerga variáveis com prefixo **`VITE_`**. Service role e chaves Asaas **não** vão no front.

---

## 2. Supabase (projeto)

### Onde conseguir

- Dashboard: [https://supabase.com/dashboard](https://supabase.com/dashboard) → seu projeto.
- **Settings → API**
  - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
  - **anon public** → `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`
  - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (secreto; só servidor/Edge)
- **Settings → Database**
  - **Database password** → útil para CLI (`SUPABASE_DB_PASSWORD`) ou montar `SUPABASE_DB_URL`
  - **Connection string** (Session pooler, porta **6543**) → `SUPABASE_DB_URL` para `npm run db:push:url`

### Onde colocar

| Variável | Local típico |
|----------|----------------|
| `VITE_SUPABASE_URL` | `.env`, Vercel (Preview/Production se o front for buildado lá) |
| `VITE_SUPABASE_ANON_KEY` | Idem |
| `SUPABASE_URL` | `.env`, Vercel (API) |
| `SUPABASE_ANON_KEY` | `.env`, Vercel (API) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`, Vercel (API), **Edge Functions Secrets** |
| `SUPABASE_DB_PASSWORD` | Só `.env` local (scripts `db:push`) |
| `SUPABASE_DB_URL` | Só `.env` local (alternativa ao link+password) |

---

## 3. Asaas (pagamentos, subcontas, webhooks)

### Onde conseguir

- **Sandbox:** [https://sandbox.asaas.com/](https://sandbox.asaas.com/) → Integrações / Minha conta → API.
- **Produção:** [https://www.asaas.com/](https://www.asaas.com/) → mesma ideia.
- **Webhook:** no painel Asaas, configure a URL do webhook e defina um **token** compartilhado (você escolhe o valor; o Asaas envia no header configurado).

### Onde colocar

| Variável | Onde obter | Onde colocar |
|----------|------------|--------------|
| `ASAAS_API_KEY` | Painel Asaas (API Key da **conta principal**) | `.env`, Vercel (`api/payments/create`, etc.), **Edge Secrets** (`create-payment`, `process-shop-finance`) |
| `ASAAS_API_URL` | Documentação Asaas v3 | Ex.: sandbox `https://sandbox.asaas.com/api/v3` · produção `https://api.asaas.com/v3` → `.env`, Vercel, Edge Secrets |
| `ASAAS_WEBHOOK_TOKEN` | Valor **que você define** e configura no Asaas ao cadastrar o webhook | **Edge Secret** `asaas-webhook` (fail-closed se ausente) |

Opcionais citados no `.env.example` (só se o código/projeto usar):

| Variável | Notas |
|----------|--------|
| `ASAAS_DEFAULT_CUSTOMER_ID` | Cenários de teste; raramente produção. |
| `ASAAS_WALLET_ID` | Se existir lógica de split com carteira da plataforma. |

---

## 4. Provisionador externo — **profissionais** (`provision-wallets`)

### Onde conseguir

- No **outro projeto** (ex.: plataforma de subcontas): URL da função `create-subaccount`, `app_id` cadastrado lá, token se o gateway exigir.

### Onde colocar

| Variável | Onde colocar |
|----------|----------------|
| `ASAAS_PROVISIONER_URL` | `.env`, **Vercel** (rota `api/partner/professionals/provision-wallets`) |
| `ASAAS_PROVISIONER_APP_ID` | Idem |
| `ASAAS_PROVISIONER_TOKEN` | Idem (opcional) |
| `ASAAS_PROVISIONER_ENV` | `sandbox` ou `production` · Idem |

---

## 5. Provisionamento assíncrono — **loja** (`process-shop-finance` + `shop-finance-webhook`)

### Onde conseguir

- **`SHOP_FINANCE_WEBHOOK_SECRET`:** gere um segredo longo e aleatório (ex.: `openssl rand -hex 32`). Quem chama a Edge `shop-finance-webhook` envia `Authorization: Bearer <esse_valor>`.
- **`ASAAS_SHOP_PROVISIONER_*`:** mesma ideia do provisionador de profissionais, mas para o fluxo **da loja** (opcional). Se não usar URL externa, o worker usa só Asaas com `ASAAS_API_KEY`.

### Onde colocar

| Variável | Onde colocar |
|----------|----------------|
| `SHOP_FINANCE_WEBHOOK_SECRET` | **Supabase Edge Functions → Secrets** (obrigatório se usar o webhook) |
| `ASAAS_SHOP_PROVISIONER_URL` | Edge Secrets (opcional) |
| `ASAAS_SHOP_PROVISIONER_APP_ID` | Edge Secrets (opcional) |
| `ASAAS_SHOP_PROVISIONER_TOKEN` | Edge Secrets (opcional) |

**URL pública do webhook** (substitua `PROJECT_REF`):

`https://<PROJECT_REF>.supabase.co/functions/v1/shop-finance-webhook`

**Corpo esperado (JSON):** `shopId`, `asaasWalletId` (ou `error` para falhar). Ver código em `supabase/functions/shop-finance-webhook/index.ts`.

---

## 6. Vercel (API serverless)

1. Projeto no Vercel → **Settings → Environment Variables**.
2. Adicione as variáveis que as rotas `api/**/*.ts` leem (`process.env.*`).
3. Mínimo comum: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ASAAS_API_KEY`, `ASAAS_API_URL`, e as do provisionador de profissionais se usar `provision-wallets`.

Redeploy após alterar variáveis.

---

## 7. Edge Functions — checklist de secrets (Supabase)

No painel: **Edge Functions → Manage secrets** (ou equivalente).

Sugestão mínima:

- `SUPABASE_URL` (às vezes já injetado; confira na doc atual do Supabase)
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASAAS_API_KEY`, `ASAAS_API_URL`
- `SHOP_FINANCE_WEBHOOK_SECRET` (para `shop-finance-webhook`)
- `ASAAS_WEBHOOK_TOKEN` (para `asaas-webhook`)

Opcionais: `ASAAS_SHOP_PROVISIONER_URL`, `ASAAS_SHOP_PROVISIONER_TOKEN`, `ASAAS_SHOP_PROVISIONER_APP_ID`.

---

## 8. Boas práticas

- **Nunca** commitar `.env` com valores reais.
- Rotacionar keys se vazarem; `service_role` e `ASAAS_API_KEY` são críticos.
- Produção e sandbox: use projetos/keys **separados** quando possível.
- Documentação adicional: [`.env.example`](.env.example), [`README.md`](README.md), [`ASAAS_PROVISIONER_ENV.md`](ASAAS_PROVISIONER_ENV.md).
