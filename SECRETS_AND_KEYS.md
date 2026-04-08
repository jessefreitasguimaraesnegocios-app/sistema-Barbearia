# Chaves e secrets — onde cada coisa mora

Guia direto: **de onde tira** cada variável do **sistema-Barbearia** e **onde cola** sem vazar no Git.

> Regra de ouro: **nunca** commitar `.env` com valor real de produção. Se vazou, rotaciona na hora (Asaas + `service_role` são prioridade máxima).

---

## Três lugares que você vai usar sempre

| Onde | Pra quê |
|------|---------|
| **`.env` na raiz (local)** | Vite + `npm run dev:api` + scripts tipo `db:push`. Só na sua máquina / CI privado. |
| **Vercel → Settings → Environment Variables** | Rotas `api/*` em produção (`admin`, `partner`, `payments`…). |
| **Supabase → Edge Functions → Secrets** | `create-shop`, `create-payment`, `process-shop-finance`, webhooks, etc. |

**Browser** só enxerga variável com prefixo **`VITE_`**.  
Tudo que é **service role**, **ASAAS_API_KEY** ou segredo de webhook fica **no servidor** ou **na Edge** — nunca no bundle do front.

---

## Supabase

### Onde pegar

- [Dashboard](https://supabase.com/dashboard) → seu projeto.
- **Settings → API:** URL do projeto, **anon**, **service_role**.
- **Settings → Database:** senha do banco, **connection string** (pooler **6543** ajuda no CLI).

### Onde colocar

| Variável | Onde costuma ir |
|----------|------------------|
| `VITE_SUPABASE_URL` | `.env`, Vercel (se o front builda lá) |
| `VITE_SUPABASE_ANON_KEY` | idem |
| `SUPABASE_URL` | `.env`, Vercel, Secrets das Edges |
| `SUPABASE_ANON_KEY` | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env`, Vercel, **Secrets** (é poder total — trata com carinho) |
| `SUPABASE_DB_PASSWORD` | Só local, para `npm run db:push` quando o CLI pede |
| `SUPABASE_DB_URL` | Só local, alternativa: `npm run db:push:url` |

---

## Asaas

### Onde pegar

- **Sandbox:** [sandbox.asaas.com](https://sandbox.asaas.com/) → API.
- **Produção:** painel Asaas oficial → mesma ideia.
- **Webhook:** você escolhe um **token** e configura no painel; o Asaas manda no header combinado.

### Onde colocar

| Variável | Uso |
|----------|-----|
| `ASAAS_API_KEY` | Conta principal · `.env`, Vercel, Edge (`create-payment`, `process-shop-finance`…) |
| `ASAAS_API_URL` | Ex.: sandbox `https://sandbox.asaas.com/api/v3` · prod `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | Edge `asaas-webhook` — deve ser **igual** ao token configurado no webhook Asaas (header `asaas-access-token`). Se não existir o secret, a função responde **500** (fail-closed). |

Opcionais que às vezes aparecem no `.env.example`:

| Variável | Nota |
|----------|------|
| `ASAAS_DEFAULT_CUSTOMER_ID` | Mais para teste |
| `ASAAS_WALLET_ID` | Só se o projeto usar split com carteira da plataforma |

---

## Provisionador externo — profissionais (`provision-wallets`)

Vem de **outro projeto** (ex.: plataforma de subcontas): URL do `create-subaccount`, `app_id`, token se existir gate.

| Variável | Onde |
|----------|------|
| `ASAAS_PROVISIONER_URL` | `.env`, Vercel |
| `ASAAS_PROVISIONER_APP_ID` | idem |
| `ASAAS_PROVISIONER_TOKEN` | idem (opcional) |
| `ASAAS_PROVISIONER_ENV` | `sandbox` ou `production` |

Mini-guia: **[ASAAS_PROVISIONER_ENV.md](./ASAAS_PROVISIONER_ENV.md)**.

---

## Loja — provisionamento assíncrono

| Variável | O quê |
|----------|--------|
| `SHOP_FINANCE_WEBHOOK_SECRET` | Segredo longo (ex. `openssl rand -hex 32`) · Bearer da Edge `shop-finance-webhook` |
| `ASAAS_SHOP_PROVISIONER_URL` | Opcional — manda cadastro da loja para serviço externo |
| `ASAAS_SHOP_PROVISIONER_TOKEN` / `APP_ID` | Opcional, combinando com o URL |

URL típica da Edge (troque o ref):

`https://<PROJECT_REF>.supabase.co/functions/v1/shop-finance-webhook`

Corpo esperado: ver `supabase/functions/shop-finance-webhook/index.ts`.

---

## Vercel (API)

1. Projeto → **Settings → Environment Variables**.
2. Tudo que `api/**/*.ts` lê em `process.env`.
3. Mudou variável → **redeploy**.

Pacote mínimo que quase todo mundo usa:  
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_API_URL` (+ provisionador se tiver `provision-wallets`).

---

## Webhook Asaas (`asaas-webhook`) — 401 nas Invocations

- O Asaas **não manda** `Authorization: Bearer` com JWT Supabase. Se a função estiver com **JWT verification** ligada no projeto, a gateway devolve **401** antes de correr o código. **Deploy obrigatório:** `npx supabase functions deploy asaas-webhook --no-verify-jwt` (ou `npm run supabase:deploy-asaas-webhook`). O `supabase/config.toml` do repo já declara `verify_jwt = false` para esta função.
- Depois do deploy, se ainda houver **401** com corpo JSON da função, verifica o header **`asaas-access-token`** vs secret **`ASAAS_WEBHOOK_TOKEN`**.

## Checklist rápido das Edge Functions (Supabase)

Sugestão de base:

- `SUPABASE_URL` (confere doc atual se já vem injetado)
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASAAS_API_KEY`, `ASAAS_API_URL`
- `SHOP_FINANCE_WEBHOOK_SECRET`
- `ASAAS_WEBHOOK_TOKEN`

Opcionais loja externa: `ASAAS_SHOP_PROVISIONER_*`.

---

## Boas práticas (sem enrolação)

- Produção e sandbox **separados** quando der.
- Nada de print de `.env` no grupo do WhatsApp do cliente 😅
- Mais contexto: [README.md](./README.md), [ASAAS_PROVISIONER_ENV.md](./ASAAS_PROVISIONER_ENV.md), [`.env.example`](./.env.example) se existir no repo.
