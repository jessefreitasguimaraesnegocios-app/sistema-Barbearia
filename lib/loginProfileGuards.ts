import { isClientOnlyRole, isPartnerOrAdminRole } from './profileRole';

/** Login na área cliente: bloquear dono/admin/equipe. */
export function shouldBlockClientHomeLogin(profileRole: unknown): boolean {
  return isPartnerOrAdminRole(profileRole);
}

/** Login em Sou parceiro: permitir só não-cliente com linha de perfil. */
export function isPartnerPortalProfileAllowed(profile: { role?: unknown } | null): boolean {
  if (!profile) return false;
  return !isClientOnlyRole(profile.role);
}
