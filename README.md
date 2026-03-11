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

**Opção 1 – usando connection string (recomendado)**

1. No [Dashboard do Supabase](https://supabase.com/dashboard) → seu projeto → **Settings** → **Database** → **Connection string** → copie a **URI** (modo Session ou Transaction).
2. No projeto, crie ou edite o `.env` e defina:
   ```bash
   SUPABASE_DB_URL=postgresql://postgres.[ref]:[SENHA]@aws-0-[região].pooler.supabase.com:6543/postgres
   ```
3. Rode:
   ```bash
   npm run db:push
   ```
   (ou `node scripts/apply-migrations.js`)

**Opção 2 – usando link do projeto**

1. Faça login: `npx supabase login`
2. Linke o projeto (use a senha do banco quando pedida): `npm run supabase:link`
3. Aplique as migrations: `npm run supabase:db-push`

**Edge Function `create-shop`**  
Depois do link (ou com projeto configurado):  
`npx supabase functions deploy create-shop`  
E configure o secret **ASAAS_API_KEY** em **Settings → Edge Functions → Secrets** no painel do Supabase.

Toda barbearia/salão é cadastrada **com subconta Asaas**; a criação da subconta (carteira) é obrigatória. Se a subconta não for criada, a loja não é cadastrada e o erro do Asaas é retornado (ex.: limite de subcontas no Sandbox, CPF/CNPJ inválido).

**Edge Function `create-payment`** (PIX com split)  
Para pagamentos funcionarem:  
`npx supabase functions deploy create-payment`  

O front envia `amount`, `customerName`, `customerEmail` e `booking`/`order` (com `shopId`). A função busca `asaas_wallet_id` e `split_percent` na tabela `shops`. O split só é enviado para a **carteira da loja** (nunca para a própria carteira da plataforma). Se a loja não tiver `asaas_wallet_id`, o pagamento é rejeitado com mensagem clara.

Em **Settings → Edge Functions → Secrets** configure:
- **ASAAS_API_KEY** – chave da API Asaas (obrigatório)
- **ASAAS_API_URL** – opcional; use `https://sandbox.asaas.com/api/v3` para testes.

**Documentos e aprovação da subconta (onboarding)**  
O parceiro envia documentos pela área **Documentos** no menu (parceiro). A rota **GET /api/partner/onboarding** (Vercel) retorna o status da conta e os links para envio (onboardingUrl). O parceiro pode abrir o link, copiar ou enviar por WhatsApp. Se a plataforma tiver **Gerenciamento de Chaves de API de Subcontas** habilitado no painel Asaas, a chave da subconta é criada automaticamente na primeira consulta; caso contrário, o suporte pode configurar `asaas_api_key` na loja manualmente.
