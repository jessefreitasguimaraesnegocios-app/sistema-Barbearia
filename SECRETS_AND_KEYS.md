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

### Onde colocar (produção vs sandbox)

O código usa **defaults** alinhados à documentação Asaas v3: produção `https://api.asaas.com/v3`, sandbox `https://api-sandbox.asaas.com/v3` (ver `asaas-webhook` / `create-payment` e `_shared/asaasEnv.ts`). Se definires `ASAAS_API_URL*`, usa URL **completa** da API (sem colar `CHAVE=valor` no campo do Dashboard).

| Variável | Uso |
|----------|-----|
| `ASAAS_API_KEY` | API **produção** · `.env`, Vercel, Edge |
| `ASAAS_API_URL` | Base URL produção (opcional; default acima) |
| `ASAAS_API_KEY_SANDBOX` | API **sandbox** · Edge (e fallbacks onde o código lê sandbox primeiro) |
| `ASAAS_API_URL_SANDBOX` | Base URL sandbox (opcional) |
| `ASAAS_WEBHOOK_TOKEN` | Edge `asaas-webhook` — **mesmo valor** do token do webhook Asaas **produção** (header `asaas-access-token`) |
| `ASAAS_WEBHOOK_TOKEN_SANDBOX` | Idem para webhook **sandbox** / user-agent `Asaas_Hmlg` |

**Comportamento do `asaas-webhook` com secrets ausentes:** se **nenhum** dos dois tokens (`ASAAS_WEBHOOK_TOKEN` / `ASAAS_WEBHOOK_TOKEN_SANDBOX`) estiver definido, a função **não processa** o evento, mas responde **200** com `note: ASAAS_WEBHOOK_TOKEN not configured` para **não penalizar** a fila de webhooks do Asaas. **401** quando o header `asaas-access-token` está vazio ou **não bate** com nenhum dos secrets.

No **painel Asaas**, produção e sandbox têm **webhooks separados**; os dois podem apontar para a **mesma URL** da Edge (`…/functions/v1/asaas-webhook`), cada um com o seu token espelhado nos secrets acima.

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
- **401** com corpo JSON da função (*Missing or invalid asaas-access-token*): o valor do painel Asaas tem de bater com **`ASAAS_WEBHOOK_TOKEN`** (produção) ou **`ASAAS_WEBHOOK_TOKEN_SANDBOX`** (homologação). A função tenta os dois (ordem favorece sandbox se o `User-Agent` contiver `hmlg` ou `sandbox`).

## Checklist rápido das Edge Functions (Supabase)

Sugestão de base:

- `SUPABASE_URL` (confere doc atual se já vem injetado)
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASAAS_API_KEY`, `ASAAS_API_URL` (+ `ASAAS_API_KEY_SANDBOX`, `ASAAS_API_URL_SANDBOX` se usares sandbox)
- `SHOP_FINANCE_WEBHOOK_SECRET`
- `ASAAS_WEBHOOK_TOKEN` e, se usares sandbox, `ASAAS_WEBHOOK_TOKEN_SANDBOX`

Opcionais loja externa: `ASAAS_SHOP_PROVISIONER_*`.

Mais detalhe de fluxo: **[docs/FLUXO_ASAAS_WEBHOOK.md](./docs/FLUXO_ASAAS_WEBHOOK.md)**.

---

## Boas práticas (sem enrolação)

- Produção e sandbox **separados** quando der.
- Nada de print de `.env` no grupo do WhatsApp do cliente 😅
- Mais contexto: [README.md](./README.md), [docs/FLUXO_ASAAS_WEBHOOK.md](./docs/FLUXO_ASAAS_WEBHOOK.md), [ASAAS_PROVISIONER_ENV.md](./ASAAS_PROVISIONER_ENV.md), [`.env.example`](./.env.example) se existir no repo.
