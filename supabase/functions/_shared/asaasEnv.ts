/** Secret colado errado tipo "ASAAS_API_URL=https://..." no campo Value do Dashboard. */
export function stripAccidentalEnvAssignment(value: string): string {
  const v = value.trim();
  const eq = v.indexOf("=");
  if (eq <= 0) return v.replace(/^["']|["']$/g, "");
  const left = v.slice(0, eq).trim();
  const right = v.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(left) && right.length > 0) return right;
  return v.replace(/^["']|["']$/g, "");
}

export function readEnvTrim(key: string): string {
  return (Deno.env.get(key) ?? "").trim();
}

export function readAsaasBaseUrl(keys: string[], fallback: string): string {
  for (const key of keys) {
    const raw = readEnvTrim(key);
    if (!raw) continue;
    const cleaned = stripAccidentalEnvAssignment(raw);
    if (/^https?:\/\//i.test(cleaned)) return cleaned.replace(/\/$/, "");
  }
  return fallback.replace(/\/$/, "");
}

/**
 * Só remove prefixo `NOME_DA_VAR=` quando for colagem literal no campo do secret.
 * Não usar stripAccidentalEnvAssignment genérico: chaves Asaas podem conter `=` (ex. padding) e seriam truncadas.
 */
function stripKnownAsaasSecretPrefix(value: string): string {
  let v = value.trim().replace(/^["']|["']$/g, "").trim();
  const prefixes = [
    /^ASAAS_API_KEY_SANDBOX=/i,
    /^ASAAS_API_KEY=/i,
    /^ASAAS_WEBHOOK_TOKEN_SANDBOX=/i,
    /^ASAAS_WEBHOOK_TOKEN=/i,
  ];
  for (const re of prefixes) {
    if (re.test(v)) {
      return v.replace(re, "").trim().replace(/^["']|["']$/g, "").trim();
    }
  }
  return v;
}

export function readAsaasApiKey(primary: string, secondary?: string): string {
  const raw = readEnvTrim(primary) || (secondary ? readEnvTrim(secondary) : "");
  return stripKnownAsaasSecretPrefix(raw);
}
