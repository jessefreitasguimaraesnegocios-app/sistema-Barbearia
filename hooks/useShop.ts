import { useState, useEffect, useCallback } from 'react';
import type { Shop } from '../types';
import { supabase } from '../src/lib/supabase';
import { fetchPartnerShopBundle } from '../services/supabase/shops';

/** Loja única do parceiro (dono/equipe): bundle shops + services + professionals + products. */
export function useShop(shopId: string | undefined, reloadKey = 0) {
  const [shop, setShop] = useState<Shop | null>(null);

  const reloadShop = useCallback(async () => {
    if (!shopId) {
      setShop(null);
      return;
    }
    const res = await fetchPartnerShopBundle(supabase, shopId);
    setShop(res.ok ? res.shop : null);
  }, [shopId]);

  useEffect(() => {
    void reloadShop();
  }, [shopId, reloadKey, reloadShop]);

  useEffect(() => {
    if (!shopId) return;

    const channel = supabase
      .channel(`shop-bundle-rt-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shopId}` },
        () => void reloadShop()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services', filter: `shop_id=eq.${shopId}` },
        () => void reloadShop()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professionals', filter: `shop_id=eq.${shopId}` },
        () => void reloadShop()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `shop_id=eq.${shopId}` },
        () => void reloadShop()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shopId, reloadShop]);

  return { shop, setShop, reloadShop };
}
