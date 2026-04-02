import { describe, it, expect } from 'vitest';
import {
  normalizeProfileRoleFromDb,
  isPartnerOrAdminRole,
  isClientOnlyRole,
} from './profileRole';

describe('profileRole', () => {
  it('normalizes casing and whitespace', () => {
    expect(normalizeProfileRoleFromDb('  ADMIN  ')).toBe('admin');
    expect(normalizeProfileRoleFromDb('Barbearia')).toBe('barbearia');
  });

  it('defaults unknown roles to cliente', () => {
    expect(normalizeProfileRoleFromDb(null)).toBe('cliente');
    expect(normalizeProfileRoleFromDb('unknown')).toBe('cliente');
  });

  it('isPartnerOrAdminRole', () => {
    expect(isPartnerOrAdminRole('admin')).toBe(true);
    expect(isPartnerOrAdminRole('barbearia')).toBe(true);
    expect(isPartnerOrAdminRole('profissional')).toBe(true);
    expect(isPartnerOrAdminRole('cliente')).toBe(false);
  });

  it('isClientOnlyRole', () => {
    expect(isClientOnlyRole('cliente')).toBe(true);
    expect(isClientOnlyRole('admin')).toBe(false);
  });
});
