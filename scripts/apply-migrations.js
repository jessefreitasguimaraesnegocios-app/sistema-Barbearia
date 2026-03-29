/**
 * Aplica todas as migrations do Supabase (supabase/migrations/*.sql) no banco remoto.
 * Requer SUPABASE_DB_URL no .env (Connection string do Dashboard → Settings → Database).
 * Prefira a URI do "Session pooler" (porta 6543, host aws-0-....pooler.supabase.com) se db.*.supabase.co der "no such host" no Windows.
 * Uso: npm run db:push:url  (requer SUPABASE_DB_URL no .env)
 */
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, '.env') });
dotenv.config({ path: join(root, '.env.local') });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Defina SUPABASE_DB_URL no .env com a connection string do Supabase:');
  console.error('Dashboard → Settings → Database → URI (Session pooler, porta 6543).');
  process.exit(1);
}

try {
  execSync('npx supabase db push --db-url ' + JSON.stringify(url), {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
} catch {
  console.error(
    '\nFalha no db push. Se viu "no such host" com db.PROJETO.supabase.co, troque SUPABASE_DB_URL pela URI do Session pooler (porta 6543) no Dashboard.'
  );
  process.exit(1);
}
