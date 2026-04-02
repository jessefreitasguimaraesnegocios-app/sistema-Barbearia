# Beauty Hub — sistema para barbearia & salão

Hub completo: cliente agenda e paga em **PIX**, parceiro gerencia a loja, admin cuida das contas.  
Stack: **React + Vite**, **Supabase** (auth, banco, realtime, Edge Functions) e **Asaas**.

> Quer entender o produto antes de mergulhar no técnico? Lê o **[SOBRE-O-APP.md](./SOBRE-O-APP.md)** (é rápido).

---

## Começar no seu PC

**Precisa:** Node.js (recomendado 20+).

```bash
npm install
```

### Só o front (interface)

```bash
npm run dev
```

Abre o Vite em `http://localhost:3000` — dá para navegar, mas **rotas `/api/*` não existem** nesse modo.

### Front + API local (recomendado para dev “de verdade”)

Documentos do parceiro, onboarding, admin, pagamentos… tudo isso fala com **`/api/*`**. Sobe os dois:

```bash
npm run dev:all
```

Ou em dois terminais: `npm run dev` e `npm run dev:api`.

**`.env` na raiz** (não commitar): no mínimo `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e o que a rota precisar (ex.: `ASAAS_API_KEY` para onboarding). Lista completa: **[SECRETS_AND_KEYS.md](./SECRETS_AND_KEYS.md)**.

### Gemini (opcional)

Se usar recursos com IA, coloca `GEMINI_API_KEY` ou `VITE_GEMINI_API_KEY` no `.env` / `.env.local` — como indicado no projeto.

---

## Banco: migrations

Tudo em `supabase/migrations/` (schema, `asaas_customer_id`, etc.).

| Caminho | Quando usar |
|--------|--------------|
| `npm run db:push` | Projeto já linkado + login no CLI (`npx supabase login` → `npm run supabase:link`) |
| `npm run db:push:url` | Só connection string no `.env` (`SUPABASE_DB_URL`, pooler porta **6543**) |

Se o CLI der **403** no “login role”, adiciona `SUPABASE_DB_PASSWORD` (senha do banco no dashboard) no `.env`.  
Detalhe fino: [access control Supabase](https://supabase.com/docs/guides/platform/access-control).

---

## Edge Functions (deploy)

Script que sobe o pacote inteiro:

```bash
npm run supabase:functions-deploy
```

Funções: `create-shop`, `create-payment`, `process-shop-finance`, `shop-finance-webhook` (com `--no-verify-jwt`), `asaas-webhook` (idem).

**Secrets** no painel: **Project → Edge Functions → Secrets**. O que colocar em cada variável está no **[SECRETS_AND_KEYS.md](./SECRETS_AND_KEYS.md)**.

---

## O que cada peça faz

### `create-shop`

Cria loja + dono + perfil `barbearia` no Supabase. **Não** dispara Asaas na hora: `finance_provision_status` começa `pending` e dados extras ficam em `finance_provision_payload`.  
No admin: **Provisionar Asaas** → `POST /api/admin/process-shop-finance` → Edge `process-shop-finance` (ou fluxo legado **Criar carteira**).

### `process-shop-finance`

Chamada com `Authorization: Bearer <SERVICE_ROLE_KEY>`.

- **Modo interno:** fluxo Asaas na própria Edge (cliente → subconta → approve sandbox → tokens…), loja vai para `finance_provision_status = active`.
- **Modo externo:** se existir `ASAAS_SHOP_PROVISIONER_*`, manda o cadastro para o serviço externo e fica `awaiting_callback` até o webhook fechar.

### `shop-finance-webhook`

`POST` com `Authorization: Bearer <SHOP_FINANCE_WEBHOOK_SECRET>` e JSON com `shopId`, `asaasWalletId`, etc. Idempotente se já estiver `active`.  
Deploy **sempre** com `--no-verify-jwt` (o token não é JWT do Supabase).

### `create-payment` (PIX + split)

Recebe `amount`, `customerName`, `customerEmail` e `booking` ou `order` (com `shopId`).

- **Agendamento:** tenta carteira do **profissional**; se não tiver, cai na **loja**.
- **Lojinha:** usa carteira da **loja**.

Sem carteira no contexto → pagamento **não** passa.

### Subconta dos **profissionais**

`POST /api/partner/professionals/provision-wallets` fala com o provisionador externo. Variáveis: ver **[ASAAS_PROVISIONER_ENV.md](./ASAAS_PROVISIONER_ENV.md)**.

### Documentos (onboarding Asaas)

Área **Documentos** no parceiro. `GET /api/partner/onboarding` devolve status e links (ex.: `onboardingUrl`).  
No Asaas, para chave de subconta automática: habilitar gerenciamento de chaves de subconta + **whitelist de IP** do servidor que chama a API (Vercel costuma exigir IP fixo de egress se for o caso).

---

## Segurança que já vem no pacote

- RPC **`security_check_rate_limit`** abuso em janela curta (`create-shop`, `create-payment`, `provision-wallets`).
- **`asaas_webhook_receipts`** evita replay no webhook.
- **`asaas-webhook`** é **fail-closed**: sem `ASAAS_WEBHOOK_TOKEN` configurado, **não** processa (melhor falhar fechado do que aceitar tudo).

---

## Qualidade e release

- `npm run lint` — TypeScript + ESLint  
- `npm test` — Vitest  
- `npm run build` — build de produção  

Antes de soltar versão: **[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)**.

---

## Documentos irmãos

| Arquivo | Pra quê |
|---------|---------|
| [SOBRE-O-APP.md](./SOBRE-O-APP.md) | Visão de produto (cliente / parceiro / admin / staff) |
| [SECRETS_AND_KEYS.md](./SECRETS_AND_KEYS.md) | Onde colocar cada chave sem vazar |
| [ASAAS_PROVISIONER_ENV.md](./ASAAS_PROVISIONER_ENV.md) | Provisionador de subcontas |
| [supabase/README.md](./supabase/README.md) | Schema rápido (SQL Editor vs CLI) |
