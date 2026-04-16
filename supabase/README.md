# Supabase — schema e migrations

Duas formas de colocar o banco no ar: **rápido pelo SQL Editor** ou **bonito pelo CLI** (migrations versionadas).

---

## Opção A — SQL Editor (só spike / banco vazio)

1. Abre o [Supabase Dashboard](https://supabase.com/dashboard) → projeto da barbearia.
2. **SQL Editor** → nova query.
3. Abre o arquivo **`RUN_IN_SQL_EDITOR.sql`** nesta pasta, copia tudo, cola, **Run**.
4. Tabelas base (`shops`, `services`, `professionals`, `appointments`…) surgem na hora.

**Importante:** esse script **aborta** se `public.shops` já existir (projeto com **migrations** aplicadas). Nesse caso use só a **Opção B** — não rode o `RUN_IN_SQL_EDITOR.sql`.

Bom para spike ou ambiente descartável. Para time e produção, prefere a opção B.

---

## Opção B — CLI + migrations (recomendado)

1. `npx supabase login` (abre o navegador).
2. Linka o projeto, por exemplo:  
   `npx supabase link --project-ref pbqedfdfnxwyoemqizsv`  
   (senha do banco em **Settings → Database**, se pedir.)
3. Empurra o que está em `supabase/migrations/`:  
   `npx supabase db push`  
   Na raiz do repo também tem `npm run db:push` / `db:push:url` — ver **[README.md](../README.md)**.

Nova alteração no schema:

```bash
npx supabase migration new descreva_em_snake_case
```

Edita o `.sql` gerado, revisa, commita com o código.

---

## Por que os `RUN_*.sql` não vão “juntos” nas migrations?

**Pode não** (no sentido de *não deve*), pelos motivos abaixo:

| Arquivo | Por que ficar fora de `migrations/` |
|---------|----------------------------------------|
| **`RUN_AGENDA_SHOP_COLUMNS.sql`** | O mesmo DDL/policy **já está** na migration `20260326200000_shop_agenda_hours_and_profile_appointments.sql`. Duplicar numa migration nova faria o `db push` repetir `ALTER`/`CREATE POLICY` sem ganho — só confusão e risco de drift entre dois arquivos. |
| **`RUN_IN_SQL_EDITOR.sql`** | É um **bootstrap mínimo** (poucas tabelas). O schema real evoluiu em **dezenas** de migrations. Colar isso dentro de `migrations/` ou **reordenar** com o histórico quebra o banco (tabelas duplicadas, colunas faltando, ordem errada). |
| **`RUN_ATUALIZAR_ASAAS_API_KEY_DK.sql`** | Atualiza **chave secreta** e dado de **uma loja**. Migrations versionadas são para **schema compartilhado** por todos os ambientes — nunca commitar API key nem UPDATE específico de produção no histórico de migration. |
| **`RUN_REPOR_LOJA_BARBEARIA_DK.sql`** | É **seed / dado de exemplo** (usuário e loja). Isso não é migration de schema; em time, cada dev teria dados diferentes. Mantém-se como script manual ou futuro `seed.sql` local. |
| **`database.sql` (raiz)** | Só aponta para `migrations/` — evita ter dois “donos” do schema. |

Resumo: **`supabase/migrations/` = schema oficial** para todo mundo; **`RUN_*.sql` = atalhos manuais** (spike, correção pontual, template). O `RUN_AGENDA_*` já “está junto” no sentido certo: **espelha** a migration com o mesmo SQL, para colar no Editor se precisar.

---

## Onde continuar lendo

- **[README.md](../README.md)** — deploy de Edge Functions, secrets, fluxo financeiro.
- **[SECRETS_AND_KEYS.md](../SECRETS_AND_KEYS.md)** — variáveis sem mistério.
