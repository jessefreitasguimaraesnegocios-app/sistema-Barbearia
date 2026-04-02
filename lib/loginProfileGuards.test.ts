import { describe, it, expect } from 'vitest';
import { shouldBlockClientHomeLogin, isPartnerPortalProfileAllowed } from './loginProfileGuards';

describe('loginProfileGuards', () => {
  it('shouldBlockClientHomeLogin blocks partner/admin roles', () => {
    expect(shouldBlockClientHomeLogin('admin')).toBe(true);
    expect(shouldBlockClientHomeLogin('barbearia')).toBe(true);
    expect(shouldBlockClientHomeLogin('cliente')).toBe(false);
  });

  it('isPartnerPortalProfileAllowed requires non-client profile', () => {
    expect(isPartnerPortalProfileAllowed(null)).toBe(false);
    expect(isPartnerPortalProfileAllowed({ role: 'cliente' })).toBe(false);
    expect(isPartnerPortalProfileAllowed({ role: 'admin' })).toBe(true);
  });
});
