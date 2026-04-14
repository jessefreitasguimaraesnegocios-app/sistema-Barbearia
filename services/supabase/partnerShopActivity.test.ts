import { describe, it, expect, vi } from 'vitest';
import { loadPartnerShopActivity } from './partnerShopActivity';

describe('loadPartnerShopActivity', () => {
  it('merges appointments and orders in parallel', async () => {
    const endOrder = async (data: unknown[]) => ({ data, error: null });

    const appointmentsChain = {
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({
                order: () => endOrder([
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
                ]),
              }),
            }),
          }),
        }),
      }),
    };

    const ordersRecentChain = {
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () =>
              endOrder([
                {
                  id: 'o1',
                  client_id: 'c1',
                  shop_id: 'shop-1',
                  items: [],
                  total: 10,
                  status: 'PAID',
                  created_at: '2026-04-01T12:00:00Z',
                },
              ]),
          }),
        }),
      }),
    };

    const ordersDeliveredChain = {
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              order: () => endOrder([]),
            }),
          }),
        }),
      }),
    };

    const profilesChain = {
      select: () => ({
        in: () => endOrder([{ id: 'c1', full_name: 'Maria', avatar_url: null }]),
      }),
    };

    let ordersCall = 0;
    const from = vi.fn((table: string) => {
      if (table === 'appointments') return appointmentsChain;
      if (table === 'orders') {
        ordersCall += 1;
        return ordersCall === 1 ? ordersRecentChain : ordersDeliveredChain;
      }
      if (table === 'profiles') return profilesChain;
      throw new Error(table);
    });

    const client = { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
    const { appointments, shopPartnerOrderRows, ordersHasMore } = await loadPartnerShopActivity(
      client,
      'shop-1',
      undefined
    );

    expect(appointments).toHaveLength(1);
    expect(appointments[0].clientId).toBe('c1');
    expect(shopPartnerOrderRows).toHaveLength(1);
    expect(shopPartnerOrderRows[0].clientDisplayName).toBe('Maria');
    expect(ordersHasMore).toBe(false);
  });
});
