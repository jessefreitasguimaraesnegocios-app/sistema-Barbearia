/**
 * Carrega variáveis de ambiente no Node (dev API) na mesma ordem de precedência
 * que o Vite usa, para que `tsx server.dev.ts` enxergue o que está em `.env.local`.
 */
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const p = resolve(root, name);
  if (existsSync(p)) dotenv.config({ path: p, override: true });
}
