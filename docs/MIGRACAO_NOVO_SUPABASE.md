# Migração para outro projeto Supabase

> **Projeto atualmente referenciado no repositório:** `pbqedfdfnxwyoemqizsv` (URLs e `npm run supabase:link`). Checklist operacional: **[SUPABASE_PROJETO_ATUAL.md](./SUPABASE_PROJETO_ATUAL.md)**.

Este guia descreve como apontar o **sistema-Barbearia** para um **projeto Supabase novo** (URL, chaves, banco, Edge Functions e integrações), sem misturar dados do projeto antigo.

> **Não é “clonar dados”:** aqui o foco é **novo projeto vazio + migrations** (schema igual). Se precisar **copiar dados** do banco antigo, use dump/restore ou ferramentas de ETL além deste passo a passo.

---

## 1. Criar o projeto novo no Supabase

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e crie um **novo projeto** (região, senha forte do Postgres).
2. Anote:
   - **Project ref** (string curta no URL do dashboard, ex.: `abcdefghij`).
   - **Project URL** (`https://SEU_REF.supabase.co`).
   - **anon** e **service_role** em **Settings → API**.

---

## 2. Atualizar o link do CLI no repositório

O script `npm run supabase:link` no `package.json` pode estar fixado no ref antigo. Para o projeto novo:

```bash
npx supabase link --project-ref SEU_NOVO_REF
```

Confirme que `supabase/.temp` / estado do link aponta para o projeto certo (ou ajuste o script `supabase:link` no `package.json` para o novo ref, para o time não errar).

---

## 3. Aplicar o schema (migrations) no banco novo

O schema fica em `supabase/migrations/`. No projeto **vazio**, aplique tudo:

```bash
npx supabase db push
```

Se o CLI reclamar de login/senha, use as opções do próprio projeto (ex.: `npm run db:push` ou `npm run db:push:url` conforme `README.md` / `SECRETS_AND_KEYS.md`, com `SUPABASE_DB_PASSWORD` ou `SUPABASE_DB_URL` no `.env` local).

**Checklist após o push:**

- Tabelas principais existem (`shops`, `profiles`, `platform_runtime_settings`, etc.).
- Trigger de auth / policies estão como nas migrations (não edite o banco “na mão” sem migration).

---

## 4. Variáveis de ambiente (app + servidor)

### Local (`.env` e/ou `.env.local`)

O Vite e o servidor de API local (`server.dev.ts`) leem `.env`, `.env.local`, etc. (ver `lib/server/loadDevEnv.ts`).

| Variável | Obrigatório | Observação |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Sim | URL do **novo** projeto. |
| `VITE_SUPABASE_ANON_KEY` | Sim | Chave **anon** do novo projeto. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim (admin/API) | **service_role** do novo projeto — nunca no front. |
| `SUPABASE_URL` | Recomendado | Mesma URL do projeto; usada em rotas `api/*` e scripts. Se omitir, muitos handlers aceitam `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Opcional | Algumas rotas usam; pode espelhar a anon. |

Atualize **todos** os valores que ainda apontem para o projeto antigo.

### Vercel (ou outro host)

Em **Settings → Environment Variables** (Production / Preview / Development):

- Replique as mesmas chaves (`VITE_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, Asaas, etc.).
- Faça **redeploy** depois de alterar variáveis.

Sem `SUPABASE_SERVICE_ROLE_KEY` e URL corretas no servidor, rotas como `/api/admin/runtime-mode` retornam erro.

---

## 5. Auth (URLs e redirect)

No dashboard do **novo** projeto: **Authentication → URL Configuration**

- **Site URL:** URL onde o app roda (ex.: `https://seu-dominio.vercel.app` ou `http://localhost:3000` em dev).
- **Redirect URLs:** inclua as rotas de callback/login que o app usa (mesmas que você já usava no projeto antigo, adaptadas ao novo domínio se mudou).

Se isso estiver errado, login ou recuperação de senha falham mesmo com chaves certas.

---

## 6. Edge Functions no projeto novo

As funções estão em `supabase/functions/`:

| Função | Notas rápidas |
|--------|----------------|
| `create-shop` | Cria loja + dono; secrets de Supabase + Asaas conforme código. |
| `create-payment` | `--no-verify-jwt` no deploy (já usado no script do repo). |
| `process-shop-finance` | Provisionamento financeiro. |
| `shop-finance-webhook` | Webhook interno; configure segredos (`SHOP_FINANCE_WEBHOOK_SECRET`, etc.). |
| `asaas-webhook` | Webhook Asaas; tokens em secrets (`ASAAS_WEBHOOK_TOKEN`, sandbox, etc.). |

**Secrets** (Dashboard → **Edge Functions → Secrets**): copie do ambiente antigo **apenas o que for válido no novo projeto** (URLs das funções mudam com o novo ref).

Deploy (equivalente ao script do `package.json`):

```bash
npx supabase functions deploy create-shop
npx supabase functions deploy create-payment --no-verify-jwt
npx supabase functions deploy process-shop-finance
npx supabase functions deploy shop-finance-webhook --no-verify-jwt
npx supabase functions deploy asaas-webhook --no-verify-jwt
```

Confira na documentação interna (ex.: `SECRETS_AND_KEYS.md`, `README.md`) quais secrets cada função exige.

---

## 7. URLs externas que apontam para o Supabase

Atualize em **todos** os lugares que ainda usam o host antigo (`…supabase.co` do projeto velho):

| Onde | O quê |
|------|--------|
| **Asaas (webhooks)** | URL da Edge `asaas-webhook` e, se existir, `shop-finance-webhook` — passam a ser `https://NOVO_REF.supabase.co/functions/v1/...`. |
| **Painel admin** | `platform_runtime_settings` e fluxos que chamam Edge/API — dependem só de env e deploy, não do ref no código. |
| **Qualquer integração** | Provisionador, URLs em `.env`, Vercel, CI. |

---

## 8. Usuários e dados

- **Auth:** usuários do projeto antigo **não** aparecem no novo até você migrá-los (export/import ou recadastro).
- **Admin:** crie de novo um usuário com `profiles.role = 'admin'` no novo banco (ou use o fluxo/migration que o projeto já prevê).
- **Lojas / PIX / Asaas:** contas e IDs no Asaas são do mundo externo; ao mudar só o Supabase, avalie se precisa **reprovisionar** carteiras/IDs conforme o fluxo do app.

---

## 9. Verificação final

1. `npm run dev` — login cliente/parceiro/admin e uma ação que bata no banco.
2. Painel admin — carregar **ambiente de pagamento** (`/api/admin/runtime-mode`) sem 500.
3. Criar loja de teste (fluxo admin + Edge `create-shop`).
4. Pagamento teste (sandbox Asaas + `create-payment`).

Se algo falhar, olhe o **corpo JSON** da API e os **logs** da Edge no dashboard do **novo** projeto.

---

## 10. Referências no repositório

- `SECRETS_AND_KEYS.md` — onde cada chave mora (local, Vercel, Edge).
- `.env.example` — lista de variáveis comentadas.
- `supabase/migrations/` — fonte da verdade do schema.
- `package.json` — scripts `supabase:*` e `db:*`.

---

## Resumo em uma frase

**Novo projeto Supabase → `supabase link` → `db push` → atualizar `.env`/Vercel → Auth URLs → secrets + deploy das Edge Functions → atualizar webhooks externos → testar.**
