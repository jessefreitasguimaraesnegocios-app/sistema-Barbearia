# Mapa Asaas — onde colocar cada coisa

Guia rápido: **conta mãe (sua comissão)**, **subconta da loja**, **cliente final** e **prod vs sandbox**.

Relacionado: [SECRETS_AND_KEYS.md](../SECRETS_AND_KEYS.md) · [FLUXO_ASAAS_WEBHOOK.md](./FLUXO_ASAAS_WEBHOOK.md)

---

## Três atores (não misturar)

| Ator | O que é | Onde configurar |
|------|---------|-----------------|
| **Conta mãe (plataforma)** | Sua conta Asaas: cria cobranças PIX, subcontas, recebe **comissão do split** e **mensalidades** | **Secrets** (Supabase Edge + Vercel). **Nunca** no Postgres. |
| **Subconta da loja** | Carteira que recebe a parte do PIX (ex.: 95% via `split_percent`) | Tabela **`shops`** (`asaas_wallet_id_*`, `asaas_api_key_*`) |
| **Cliente final** | Quem agenda/compra; pagador do PIX | **`profiles`** no Supabase; customer Asaas criado **na hora** em `create-payment` |

---

## Onde colocar chaves prod / sandbox (conta mãe)

### Supabase → Project → Edge Functions → **Secrets**

| Secret | Ambiente |
|--------|----------|
| `ASAAS_API_KEY` | Produção (`$aact_prod_...`) |
| `ASAAS_API_URL` | `https://api.asaas.com/v3` (opcional) |
| `ASAAS_API_KEY_SANDBOX` | Sandbox (`$aact_hmlg_...`) |
| `ASAAS_API_URL_SANDBOX` | `https://api-sandbox.asaas.com/v3` (opcional) |
| `ASAAS_WEBHOOK_TOKEN` | Token do webhook **produção** (painel Asaas) |
| `ASAAS_WEBHOOK_TOKEN_SANDBOX` | Token do webhook **sandbox** |

Funções que usam: `create-payment`, `asaas-webhook`, `process-shop-finance`.

### Vercel → Settings → **Environment Variables**

As **mesmas** variáveis `ASAAS_API_*` para rotas `api/*` (`api/payments/create`, `api/admin/wallet`, `api/admin/shops/.../create-wallet`).

> Ao rotacionar chave: atualize **Supabase Secrets e Vercel** juntos.

### Qual ambiente está ativo (não é secret)

| Onde | Coluna | Valores |
|------|--------|---------|
| Global | `platform_runtime_settings.asaas_mode` | `production` \| `sandbox` |
| Por loja (opcional) | `shops.asaas_runtime_mode` | `production` \| `sandbox` \| `NULL` (= segue global) |

O código escolhe o par chave+URL com base nisso (`lib/payments/resolve-shop-split.ts` + `lib/payments/asaas-platform-env.ts`).

---

## O que fica no banco (`shops` e afins)

### Loja — financeiro Asaas

| Coluna | Significado |
|--------|-------------|
| `asaas_wallet_id_prod` / `asaas_wallet_id_sandbox` | Carteira da subconta para **split** no PIX |
| `asaas_api_key_prod` / `asaas_api_key_sandbox` | Chave da **subconta** (só `service_role`; parceiro usa em `/api/partner/wallet`) |
| `asaas_account_id` | ID da subconta no Asaas |
| `asaas_customer_id` | Cliente da **loja** na conta mãe (mensalidade) |
| `asaas_platform_subscription_id` | Assinatura da plataforma no Asaas |
| `split_percent` / `split_percent_sandbox` | % que vai para a loja (ex.: 95 → ~5% fica na conta mãe) |
| `asaas_api_key_configured` | Flag para o admin (sem expor a chave) |

Colunas legado `asaas_wallet_id` / `asaas_api_key`: preferir sempre `_*_prod` e `_*_sandbox`.

### Provisionamento assíncrono

| Tabela | Uso |
|--------|-----|
| `shop_finance_provision` | Status (`pending` → `active`), erros, payload de cadastro para o worker |

Worker: Edge **`process-shop-finance`** (usa chave da **conta mãe** para criar subconta e gravar wallet/chave na loja).

### Cliente que agenda

- Dados em **`profiles`** (nome, CPF, etc.).
- **Não** guardamos `asaas_customer_id` do cliente final: `create-payment` chama `POST /customers` no Asaas a cada cobrança (eficiente, menos sync).

---

## Sua comissão (split)

1. `create-payment` usa a **chave da conta mãe** e envia `split` com `walletId` da loja + `percentualValue` (`split_percent`).
2. O Asaas credita a loja na subconta e o **resto permanece na conta mãe**.
3. Saldo/saque da plataforma: **`GET/POST /api/admin/wallet`** (respeita `platform_runtime_settings.asaas_mode`).

---

## Três painéis Asaas (checklist mental)

1. **Asaas produção (conta mãe)** → `ASAAS_API_KEY` + webhook prod → `ASAAS_WEBHOOK_TOKEN`
2. **Asaas sandbox (conta mãe)** → `ASAAS_API_KEY_SANDBOX` + webhook sandbox → `ASAAS_WEBHOOK_TOKEN_SANDBOX`
3. **Subconta de cada loja** → só no **banco** (`shops`), criada via `process-shop-finance` ou admin `create-wallet`

---

## Checklist — nova loja parceira

1. [ ] Loja em `shops` com `cnpj_cpf`, `email`, `phone`, endereço
2. [ ] Provisionar: admin **Provisionar Asaas** ou `process-shop-finance` → `shop_finance_provision.status = active`
3. [ ] Conferir `asaas_wallet_id_prod` ou `_sandbox` (conforme modo de teste)
4. [ ] Ajustar `split_percent` / `split_percent_sandbox` no admin
5. [ ] `platform_runtime_settings.asaas_mode` alinhado com as chaves nos secrets
6. [ ] Webhook Asaas apontando para `…/functions/v1/asaas-webhook` com token correto

---

## Checklist — pagamento de cliente (agendamento/pedido)

1. [ ] Loja com wallet no ambiente ativo
2. [ ] Secrets `ASAAS_API_KEY*` do ambiente correto
3. [ ] Cliente com CPF válido no perfil/checkout
4. [ ] Webhook confirma → `appointments` / `orders` → `PAID`

---

## O que **nunca** fazer

- Colocar `ASAAS_API_KEY` da conta mãe em tabela ou no front
- Copiar **Digest** do Supabase como valor do secret (é só hash de referência)
- Usar só `asaas_wallet_id` legado em loja nova (usar colunas por ambiente)
