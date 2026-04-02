import { describe, it, expect, vi } from 'vitest';
import { loadPartnerShopActivity } from './partnerShopActivity';

describe('loadPartnerShopActivity', () => {
  it('merges appointments and orders in parallel', async () => {
    const appointmentsChain = {
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [
                {
                  id: 'a1',
                  client_id: 'c1',
                  shop_id: 'shop-1',
                  service_id: 's1',
                  professional_id: 'p1',
                  date: '2026-04-01',
                  time: '10:00:00',
                  status: 'PENDING',
                  amount: 50,
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const ordersChain = {
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              {
                id: 'o1',
                client_id: 'c1',
                shop_id: 'shop-1',
                items: [],
                total: 10,
                status: 'PAID',
                created_at: '2026-04-01T12:00:00Z',
              },
            ],
            error: null,
          }),
        }),
      }),
    };

    const profilesChain = {
      select: () => ({
        in: async () => ({
          data: [{ id: 'c1', full_name: 'Maria', avatar_url: null }],
          error: null,
        }),
      }),
    };

    const from = vi.fn((table: string) => {
      if (table === 'appointments') return appointmentsChain;
      if (table === 'orders') return ordersChain;
      if (table === 'profiles') return profilesChain;
      throw new Error(table);
    });

    const client = { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
    const { appointments, shopPartnerOrderRows } = await loadPartnerShopActivity(client, 'shop-1', undefined);

    expect(appointments).toHaveLength(1);
    expect(appointments[0].clientId).toBe('c1');
    expect(shopPartnerOrderRows).toHaveLength(1);
    expect(shopPartnerOrderRows[0].clientDisplayName).toBe('Maria');
  });
});
