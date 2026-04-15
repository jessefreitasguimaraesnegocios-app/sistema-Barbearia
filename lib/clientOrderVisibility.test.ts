import { describe, expect, it } from 'vitest';
import { isClientListVisibleOrder, ordersClientVisibleOrFilter } from './clientOrderVisibility';

describe('clientOrderVisibility', () => {
  it('mantém pedidos não entregues visíveis', () => {
    expect(isClientListVisibleOrder({ status: 'PENDING' }, '2026-04-15')).toBe(true);
    expect(isClientListVisibleOrder({ status: 'PAID' }, '2026-04-15')).toBe(true);
  });

  it('esconde DELIVERED de dias anteriores no Brasil', () => {
    expect(
      isClientListVisibleOrder(
        { status: 'DELIVERED', handedOverAtIso: '2026-04-14T02:59:59.000Z' },
        '2026-04-15',
      ),
    ).toBe(false);
    expect(
      isClientListVisibleOrder(
        { status: 'DELIVERED', handedOverAtIso: '2026-04-15T03:00:00.000Z' },
        '2026-04-15',
      ),
    ).toBe(true);
  });

  it('gera filtro PostgREST para DELIVERED do dia + ativos', () => {
    const filter = ordersClientVisibleOrFilter(new Date('2026-04-15T12:00:00.000Z'));
    expect(filter.includes('status.eq.DELIVERED')).toBe(true);
    expect(filter.includes('handed_over_at.gte.')).toBe(true);
    expect(filter.includes('status.in.(PENDING,PAID)')).toBe(true);
  });
});
