/**
 * Aplica todas as migrations do Supabase (supabase/migrations/*.sql) no banco remoto.
 * Requer SUPABASE_DB_URL no .env (Connection string do Dashboard → Settings → Database → URI).
 * Uso: node scripts/apply-migrations.js
 * Ou: npm run db:push
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
  console.error('Dashboard → Settings → Database → Connection string → URI');
  process.exit(1);
}

execSync('npx supabase db push --db-url ' + JSON.stringify(url), {
  stdio: 'inherit',
  cwd: root,
  shell: true,
});
