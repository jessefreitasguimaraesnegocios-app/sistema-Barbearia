# Aplicar o schema no Supabase

## Opção 1 – SQL Editor (mais rápido)

1. Abra o [Supabase Dashboard](https://supabase.com/dashboard) → seu projeto **barbearia**.
2. Vá em **SQL Editor** → **New query**.
3. Abra o arquivo **`RUN_IN_SQL_EDITOR.sql`** desta pasta, copie todo o conteúdo e cole no editor.
4. Clique em **Run**. As tabelas `shops`, `services`, `professionals` e `appointments` serão criadas.

## Opção 2 – CLI (para usar migrations no futuro)

1. No terminal: `npx supabase login` (abre o navegador para autenticar).
2. Vincule o projeto: `npx supabase link --project-ref wevcqosziiwfbxbmjqln` (use a senha do banco em **Settings → Database** se pedir).
3. Envie as migrations: `npx supabase db push`.

As migrations ficam em `supabase/migrations/`. Novas alterações podem ser criadas com `npx supabase migration new nome_da_migration`.
