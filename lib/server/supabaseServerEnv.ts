/**
 * Resolução de URL e chaves do Supabase em rotas server-side (Vercel / Node).
 * Inclui fallbacks para nomes novos (JSON) e para variáveis expostas ao build do Vite (VITE_*).
 */

function parseFirstStringFromJsonMap(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const map = parsed as Record<string, unknown>;
    const preferredKeys = ['service_role', 'serviceRole', 'anon', 'publishable', 'default'];
    for (const key of preferredKeys) {
      const value = map[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    for (const value of Object.values(map)) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveSupabaseProjectUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).replace(/\/$/, '');
}

export function resolveSupabaseAnonKey(): string | undefined {
  const fromJson = parseFirstStringFromJsonMap(process.env.SUPABASE_PUBLISHABLE_KEYS);
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    fromJson ||
    undefined
  );
}

export function resolveSupabaseServiceRoleKey(): string | undefined {
  const fromJson = parseFirstStringFromJsonMap(process.env.SUPABASE_SECRET_KEYS);
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SECRET_KEY ||
    fromJson ||
    undefined
  );
}

export function describeMissingSupabaseServerEnv(): string {
  const missing = [
    !resolveSupabaseProjectUrl() ? 'SUPABASE_URL (ou VITE_SUPABASE_URL)' : null,
    !resolveSupabaseAnonKey() ? 'SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEYS)' : null,
    !resolveSupabaseServiceRoleKey()
      ? 'SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEYS / SUPABASE_SECRET_KEY)'
      : null,
  ]
    .filter(Boolean)
    .join(', ');
  return `Configuração do Supabase indisponível no servidor. Variável(is) ausente(s): ${missing}.`;
}
