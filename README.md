<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ddeb1908-60ff-49a3-850a-10f354557390

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

(O app sobe só com Vite; não há mais backend Express.)

Para testar a **área de documentos** (parceiro) em desenvolvimento, as rotas `/api/*` precisam estar ativas. Use um dos modos:

- **`npm run dev:all`** — sobe o Vite e o servidor da API juntos (recomendado).
- Ou em dois terminais: **`npm run dev`** e **`npm run dev:api`**.

Certifique-se de ter um `.env` com `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` e `ASAAS_API_KEY` para a rota `/api/partner/onboarding` responder corretamente.

## Aplicar todos os .sql (migrations) via CLI

As migrations ficam em `supabase/migrations/` (incluindo schema inicial e `asaas_customer_id`). Para aplicá-las no banco remoto:

**Opção 1 – CLI com `npx` (padrão: `npm run db:push`)**

1. Faça login: `npx supabase login`
2. Linke o projeto: `npm run supabase:link` (ref em `package.json`; use a **senha do banco** se o CLI pedir)
3. Se `db push` mostrar **403** em `Initialising login role`, coloque no `.env` (não commitar):
   ```bash
   SUPABASE_DB_PASSWORD=<senha em Dashboard → Database → Database password>
   ```
   O comando `npm run db:push` carrega o `.env` e repassa essa variável ao CLI.
4. Aplique as migrations: `npm run db:push`

Alternativa: conta com papel **Owner** no projeto na organização Supabase, conforme [access control](https://supabase.com/docs/guides/platform/access-control).

**Opção 2 – connection string no `.env` (sem link)**

1. No [Dashboard](https://supabase.com/dashboard) → **Settings** → **Database** → **Connection string** → URI (prefira **Session pooler**, porta **6543**).
2. No `.env`: `SUPABASE_DB_URL=postgresql://...`
3. Rode: `npm run db:push:url`

**Edge Functions (create-shop, create-payment, asaas-webhook)**  
Depois do link (ou com projeto configurado), para fazer deploy de todas de uma vez:

```bash
npm run supabase:functions-deploy
```

Ou individualmente:
```bash
npx supabase functions deploy create-shop --no-verify-jwt
npx supabase functions deploy create-payment
npx supabase functions deploy asaas-webhook --no-verify-jwt
```

Configure os secrets em **Settings → Edge Functions → Secrets** no painel do Supabase:
- **ASAAS_API_KEY** – chave da API Asaas (conta principal, obrigatório)
- **ASAAS_API_URL** – opcional; use `https://sandbox.asaas.com/api/v3` para testes

**create-shop** – Cadastra parceiro e cria subconta Asaas (POST /accounts com loginEmail), aprova no sandbox (approve), gera chave da subconta (accessTokens) e salva `asaas_account_id`, `asaas_wallet_id` e `asaas_api_key` na tabela `shops`. Toda barbearia/salão é cadastrada com subconta; se a subconta não for criada, a loja não é cadastrada.

**create-payment** (PIX com split) – O front envia `amount`, `customerName`, `customerEmail` e `booking`/`order` (com `shopId`). A função aplica split por contexto:
- `booking` (serviço): tenta usar `professionals.asaas_wallet_id` e `professionals.split_percent`; se o profissional não tiver carteira, faz fallback para carteira/percentual da loja.
- `order` (lojinha): usa `shops.asaas_wallet_id` e `shops.split_percent`.
Se não houver carteira disponível no contexto, o pagamento é rejeitado.

**Provisionamento de subcontas por profissional** – A rota `POST /api/partner/professionals/provision-wallets` cria/vincula carteiras dos profissionais sem `asaas_wallet_id`, chamando o provisionador externo já pronto (projeto de subcontas Asaas). Configure:
- `ASAAS_PROVISIONER_URL` (endpoint HTTP da função `create-subaccount`);
- `ASAAS_PROVISIONER_APP_ID` (app_id do sistema barbearia no provisionador);
- `ASAAS_PROVISIONER_TOKEN` (opcional, se seu provisionador exigir bearer token);
- `ASAAS_PROVISIONER_ENV` (`sandbox` ou `production`, opcional).

**Documentos e aprovação da subconta (onboarding)**  
O parceiro envia documentos pela área **Documentos** no menu (parceiro). A rota **GET /api/partner/onboarding** (Vercel) retorna o status da conta e os links para envio (onboardingUrl). O parceiro pode abrir o link, copiar ou enviar por WhatsApp. Para a chave da subconta ser criada automaticamente (ou na primeira vez que o parceiro abre Documentos), é necessário no painel Asaas: (1) **Habilitar** em Integrações → Chaves de API → *Gerenciamento de Chaves de API de Subcontas* (acesso temporário, 2h); (2) **Whitelist de IP**: adicionar os IPs de saída do servidor que chama a API (ex.: no Vercel, usar IP de egress estático ou consultar a documentação do Vercel para IPs de saída). Sem isso, a mensagem “o suporte precisa configurar a chave” aparece e o admin pode configurar `asaas_api_key` na loja manualmente.
