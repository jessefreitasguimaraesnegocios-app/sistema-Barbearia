/** Valor vindo de public.profiles.role (PostgREST pode variar em espaços/caso). */
export type DbProfileRole = 'admin' | 'barbearia' | 'cliente' | 'profissional';

export function normalizeProfileRoleFromDb(raw: unknown): DbProfileRole {
  const r = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (r === 'admin' || r === 'barbearia' || r === 'profissional' || r === 'cliente') return r;
  return 'cliente';
}

export function isPartnerOrAdminRole(role: unknown): boolean {
  const r = normalizeProfileRoleFromDb(role);
  return r === 'admin' || r === 'barbearia' || r === 'profissional';
}

export function isClientOnlyRole(role: unknown): boolean {
  return normalizeProfileRoleFromDb(role) === 'cliente';
}
