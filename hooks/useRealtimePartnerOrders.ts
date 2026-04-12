import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShopPartnerOrderRow } from '../types';
import { fetchPartnerOrdersWithProfiles } from '../services/supabase/partnerShopActivity';

/**
 * Atualiza a lista de pedidos da loja quando `orders` muda (ex.: novo PIX pago, entregue).
 */
export function useRealtimePartnerOrders(
  client: SupabaseClient,
  shopId: string | undefined,
  setShopPartnerOrderRows: Dispatch<SetStateAction<ShopPartnerOrderRow[]>>
): void {
  useEffect(() => {
    if (!shopId) return;

    const refresh = () => {
      void fetchPartnerOrdersWithProfiles(client, shopId).then(setShopPartnerOrderRows);
    };

    const channel = client
      .channel(`partner-orders-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shopId}` },
        () => refresh()
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, shopId, setShopPartnerOrderRows]);
}
