import { describe, it, expect, vi } from 'vitest';
import { fetchPartnerShopBundle } from './shops';

function mockSupabaseForPartnerBundle() {
  const shopRow = {
    id: 'shop-1',
    owner_id: 'owner-1',
    name: 'Test Shop',
    type: 'BARBER',
    description: '',
    address: '',
    profile_image: '',
    banner_image: '',
    primary_color: '#111',
    theme: 'MODERN',
    subscription_active: true,
    subscription_amount: 99,
    rating: 5,
    asaas_account_id: null,
    asaas_wallet_id: null,
    cnpj_cpf: null,
    email: null,
    phone: null,
    pix_key: null,
    split_percent: 95,
    split_percent_sandbox: null,
    pass_fees_to_customer: false,
    workday_start: '08:00:00',
    workday_end: '20:00:00',
    lunch_start: null,
    lunch_end: null,
    agenda_slot_minutes: 30,
    asaas_api_key_configured: false,
    finance_provision_status: 'pending',
    finance_provision_last_error: null,
  };

  const from = vi.fn((table: string) => {
    if (table === 'shops') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: shopRow, error: null }),
          }),
        }),
      };
    }
    if (table === 'services') {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                {
                  id: 's1',
                  name: 'Corte',
                  description: '',
                  price: 40,
                  duration: 30,
                },
              ],
              error: null,
            }),
        }),
      };
    }
    if (table === 'professionals') {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [
                {
                  id: 'p1',
                  shop_id: 'shop-1',
                  name: 'João',
                  specialty: 'Barbeiro',
                  avatar: '',
                  email: '',
                  phone: '',
                  cpf_cnpj: '',
                  birth_date: '',
                  asaas_account_id: null,
                  asaas_wallet_id: null,
                  asaas_environment: null,
                  split_percent: null,
                  user_id: null,
                },
              ],
              error: null,
            }),
        }),
      };
    }
    if (table === 'products') {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [],
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, shopRow };
}

describe('fetchPartnerShopBundle', () => {
  it('returns mapped shop when row and relations load', async () => {
    const { client } = mockSupabaseForPartnerBundle();
    const res = await fetchPartnerShopBundle(client, 'shop-1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.shop.id).toBe('shop-1');
    expect(res.shop.name).toBe('Test Shop');
    expect(res.shop.services).toHaveLength(1);
    expect(res.shop.services[0].name).toBe('Corte');
    expect(res.shop.professionals).toHaveLength(1);
  });

  it('returns error when shop missing', async () => {
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: 'not found' } }),
        }),
      }),
    }));
    const res = await fetchPartnerShopBundle({ from } as unknown as import('@supabase/supabase-js').SupabaseClient, 'x');
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toBe('not found');
    }
  });
});
