import { describe, expect, it } from 'vitest';
import { isClientListVisibleAppointment } from './clientAppointmentVisibility';

describe('isClientListVisibleAppointment', () => {
  it('mostra não-COMPLETED independentemente da data', () => {
    expect(isClientListVisibleAppointment({ status: 'PAID', date: '2020-01-01' }, '2026-04-15')).toBe(true);
    expect(isClientListVisibleAppointment({ status: 'PENDING', date: '2020-01-01' }, '2026-04-15')).toBe(true);
  });

  it('mostra COMPLETED só se date >= hoje (BRT injetado)', () => {
    expect(isClientListVisibleAppointment({ status: 'COMPLETED', date: '2026-04-15' }, '2026-04-15')).toBe(true);
    expect(isClientListVisibleAppointment({ status: 'COMPLETED', date: '2026-04-16' }, '2026-04-15')).toBe(true);
    expect(isClientListVisibleAppointment({ status: 'COMPLETED', date: '2026-04-14' }, '2026-04-15')).toBe(false);
  });
});
