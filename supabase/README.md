# Supabase — schema e migrations

Duas formas de colocar o banco no ar: **rápido pelo SQL Editor** ou **bonito pelo CLI** (migrations versionadas).

---

## Opção A — SQL Editor (quando quer só “fazer funcionar”)

1. Abre o [Supabase Dashboard](https://supabase.com/dashboard) → projeto da barbearia.
2. **SQL Editor** → nova query.
3. Abre o arquivo **`RUN_IN_SQL_EDITOR.sql`** nesta pasta, copia tudo, cola, **Run**.
4. Tabelas base (`shops`, `services`, `professionals`, `appointments`…) surgem na hora.

Bom para spike ou ambiente descartável. Para time e produção, prefere a opção B.

---

## Opção B — CLI + migrations (recomendado)

1. `npx supabase login` (abre o navegador).
2. Linka o projeto, por exemplo:  
   `npx supabase link --project-ref wevcqosziiwfbxbmjqln`  
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

## Onde continuar lendo

- **[README.md](../README.md)** — deploy de Edge Functions, secrets, fluxo financeiro.
- **[SECRETS_AND_KEYS.md](../SECRETS_AND_KEYS.md)** — variáveis sem mistério.
