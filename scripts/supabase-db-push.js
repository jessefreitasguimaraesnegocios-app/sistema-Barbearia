/**
 * Roda `npx supabase db push` com variáveis do .env carregadas.
 * Se aparecer 403 em "login role", defina no .env (não commitar):
 *   SUPABASE_DB_PASSWORD=<senha do banco em Dashboard → Database>
 */
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
dotenv.config({ path: join(projectRoot, '.env') });
dotenv.config({ path: join(projectRoot, '.env.local') });

const res = spawnSync('npx', ['supabase', 'db', 'push'], {
  stdio: 'inherit',
  cwd: projectRoot,
  shell: true,
  env: process.env,
});

process.exit(res.status ?? 1);
