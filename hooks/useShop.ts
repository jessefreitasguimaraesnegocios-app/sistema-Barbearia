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

  return { shop, setShop, reloadShop };
}
