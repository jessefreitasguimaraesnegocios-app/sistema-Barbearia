# Projeto Supabase atual: `pbqedfdfnxwyoemqizsv`

O repositório já aponta o script `npm run supabase:link` e os exemplos de `.env.example` para este **project ref**. Use este arquivo como checklist do que ainda é **manual** no dashboard e na CLI.

---

## Resumo — o que falta / confirmar (guia direto)

### Banco (`pbqedfdfnxwyoemqizsv`)

1. **`db push` / migrations** — Aplicam **só** o que está em `supabase/migrations/`. Os arquivos `supabase/RUN_*.sql` **não** rodam sozinhos com `db push` (ver [supabase/README.md](../supabase/README.md) — secção sobre `RUN_*.sql`).
2. **Agenda na tabela `shops`** — Se já correste `npm run db push` e apareceu *up to date*, o DDL da agenda **já está** na migration `20260326200000_shop_agenda_hours_and_profile_appointments.sql`. **Não é obrigatório** abrir `RUN_AGENDA_SHOP_COLUMNS.sql` no SQL Editor.
3. **Confirmar visualmente (mata dúvida):** Dashboard → **Table Editor** → `shops` → colunas `workday_start`, `workday_end`, `lunch_start`, `lunch_end`, `agenda_slot_minutes`. Se todas existem, está alinhado com o repo.
4. **`RUN_IN_SQL_EDITOR.sql`**, **`RUN_ATUALIZAR_*`**, **`RUN_REPOR_*`** — Opcionais / legado / seed (ex. caso D_K). Só mudam algo se **alguém colar e der Run** no SQL Editor. Para o app “padrão”, pode ignorar.

### Fora do Postgres (obrigatório para o app funcionar de ponta a ponta)

5. **`.env` / `.env.local`** na tua máquina — URL e chaves **deste** projeto (secção 1 abaixo).
6. **Edge Functions → Secrets** no dashboard — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Asaas, webhooks, etc. (secção 4). Sem isso as functions quebram em runtime.
7. **Vercel** (se usas) — Mesmas variáveis + **redeploy**.
8. **Auth → URL Configuration** — Site URL + redirect URLs (secção 6).
9. **Usuário admin** — No projeto novo não existe o login antigo até criares utilizador em Auth e `profiles.role = 'admin'` (ou fluxo que uses).
10. **Asaas** — Webhooks apontando para `…/pbqedfdfnxwyoemqizsv.supabase.co/functions/v1/asaas-webhook` (e `shop-finance-webhook` se aplicável).

---

## URLs fixas deste projeto

| Uso | URL |
|-----|-----|
| API / REST / Auth | `https://pbqedfdfnxwyoemqizsv.supabase.co` |
| Edge Functions (base) | `https://pbqedfdfnxwyoemqizsv.supabase.co/functions/v1/` |

**Webhooks Asaas** (produção e sandbox, se usar os dois), aponte para:

- `https://pbqedfdfnxwyoemqizsv.supabase.co/functions/v1/asaas-webhook`

**Webhook de provisionamento de loja** (se o fluxo usar `shop-finance-webhook`):

- `https://pbqedfdfnxwyoemqizsv.supabase.co/functions/v1/shop-finance-webhook`

Qualquer URL ainda com outro `*.supabase.co` no Asaas ou em `.env` da Vercel continua falhando até trocar.

---

## 1. Sua máquina — `.env` / `.env.local`

Atualize **na mão** (não commitar):

- `VITE_SUPABASE_URL=https://pbqedfdfnxwyoemqizsv.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon do novo projeto>`
- `SUPABASE_SERVICE_ROLE_KEY=<service_role do novo>`
- `SUPABASE_URL` igual à URL do projeto (recomendado para `api/*` e scripts)
- `SUPABASE_ANON_KEY` (opcional, se alguma rota usar)

Se usar `db push` com pooler: `SUPABASE_DB_URL` ou `SUPABASE_DB_PASSWORD` conforme [README](../README.md) — **host/região** vêm do Dashboard → Database do projeto **pbqedfdfnxwyoemqizsv** (não copie URI de outro ref).

---

## 2. CLI — link + schema

Na raiz do repo:

```bash
npx supabase login
npm run supabase:link
```

Isso executa `supabase link --project-ref pbqedfdfnxwyoemqizsv`.

Depois aplique as migrations no remoto:

```bash
npm run db:push
```

(ou `npx supabase db push` se o `.env` já estiver ok.)

---

## 3. Edge Functions — o que existe e o que falta

Pastas em `supabase/functions/`:

| Função | Deploy típico | JWT |
|--------|----------------|-----|
| `create-shop` | `npx supabase functions deploy create-shop` | verificar no dashboard se exige JWT; o app costuma invocar com sessão |
| `create-payment` | `npx supabase functions deploy create-payment --no-verify-jwt` | `--no-verify-jwt` |
| `process-shop-finance` | `npx supabase functions deploy process-shop-finance` | padrão |
| `shop-finance-webhook` | `npx supabase functions deploy shop-finance-webhook --no-verify-jwt` | chamada externa com Bearer |
| `asaas-webhook` | `npx supabase functions deploy asaas-webhook --no-verify-jwt` | Asaas → Edge |

**Tudo de uma vez** (igual ao `package.json`):

```bash
npm run supabase:functions-deploy
```

No Dashboard → **Edge Functions**, confirme que as cinco aparecem. Se alguma não existir, o deploy acima cria/atualiza.

---

## 4. Secrets das Edge Functions (novo projeto)

Em **Project Settings → Edge Functions → Secrets**, configure no mínimo (espelhe o que você já tinha no projeto antigo, com valores válidos):

**Todas as funções que falam com o banco**

- `SUPABASE_URL` = `https://pbqedfdfnxwyoemqizsv.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = service role deste projeto

**Asaas / pagamentos / webhook**

- `ASAAS_API_KEY`, `ASAAS_API_URL` (produção, se usar)
- `ASAAS_API_KEY_SANDBOX`, `ASAAS_API_URL_SANDBOX` (sandbox, se usar)
- `ASAAS_WEBHOOK_TOKEN`, `ASAAS_WEBHOOK_TOKEN_SANDBOX` (tokens iguais aos configurados no painel Asaas para a URL nova)

**Opcionais** (só se o fluxo usar)

- `SHOP_FINANCE_WEBHOOK_SECRET` — `shop-finance-webhook`
- `ASAAS_SHOP_PROVISIONER_URL`, `ASAAS_SHOP_PROVISIONER_TOKEN`, `ASAAS_SHOP_PROVISIONER_APP_ID`, `ASAAS_PROVISIONER_ENV` — `process-shop-finance`

Detalhe por variável: **[SECRETS_AND_KEYS.md](../SECRETS_AND_KEYS.md)**.

---

## 5. Vercel (ou outro host)

Em **Environment Variables**, troque para o novo projeto:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (se usar)
- demais chaves Asaas / webhooks como no ambiente antigo

Faça **redeploy** após salvar.

---

## 6. Auth no Supabase

**Authentication → URL Configuration**: Site URL e Redirect URLs do app (localhost + domínio de produção).

---

## 7. O que o código do repo **não** migra sozinho

- Usuários **Auth** do projeto antigo
- Linhas de **banco** (só entram com `db push` + dados que você importar)
- Contas/carteiras **Asaas** (IDs nas tabelas continuam os mesmos só se você mantiver o mesmo Asaas e copiar dados; projeto novo + banco vazio exige fluxos de provisionamento de novo)

---

## Referência rápida

- Guia genérico de troca de projeto: **[MIGRACAO_NOVO_SUPABASE.md](./MIGRACAO_NOVO_SUPABASE.md)**

---

## Status verificado neste repo (CLI)

- **Link:** `pbqedfdfnxwyoemqizsv` já aparecia como projeto linkado (`supabase projects list`).
- **Migrations:** `npx supabase db push` → *Remote database is up to date.*
- **Edge Functions:** antes não havia funções no projeto; após `npm run supabase:functions-deploy` estão publicadas: `create-shop`, `create-payment`, `process-shop-finance`, `shop-finance-webhook`, `asaas-webhook`.

Se rodar `npx supabase functions list` de novo, as cinco devem aparecer. **Secrets** das functions e **`.env` / Vercel** continuam sendo configuração manual (o deploy não copia secrets do projeto antigo).
