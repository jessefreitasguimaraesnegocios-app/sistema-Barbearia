import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order } from '../types';
import { mapRowToOrder, sortOrdersNewestFirst } from '../services/supabase/orderMapping';
import { isClientListVisibleOrder } from '../lib/clientOrderVisibility';

function rowVisibleForClient(row: Order, clientUserId?: string): boolean {
  if (clientUserId && row.clientId !== clientUserId) return false;
  if (!isClientListVisibleOrder(row)) return false;
  return true;
}

export type UseRealtimeOrdersParams = {
  client: SupabaseClient;
  enabled: boolean;
  channelName: string;
  postgresChangesFilter: string;
  setOrders: Dispatch<SetStateAction<Order[]>>;
  clientUserId?: string;
};

/**
 * Realtime em `public.orders` com merge local (sem refetch da lista inteira por evento).
 */
export function useRealtimeOrders(params: UseRealtimeOrdersParams): void {
  const { client, enabled, channelName, postgresChangesFilter, setOrders, clientUserId } = params;

  useEffect(() => {
    if (!enabled || !postgresChangesFilter) return;

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: postgresChangesFilter },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Record<string, unknown> | undefined;
            const id = oldRow?.id != null ? String(oldRow.id) : '';
            if (!id) return;
            setOrders((old) => old.filter((x) => x.id !== id));
            return;
          }

          const rawNew = payload.new as Record<string, unknown> | undefined;
          if (!rawNew || rawNew.id == null) return;
          const next = mapRowToOrder(rawNew);

          if (payload.eventType === 'INSERT') {
            if (!rowVisibleForClient(next, clientUserId)) return;
            setOrders((old) => {
              if (old.some((x) => x.id === next.id)) {
                return sortOrdersNewestFirst(old.map((x) => (x.id === next.id ? next : x)));
              }
              return sortOrdersNewestFirst([...old, next]);
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((old) => {
              const id = next.id;
              const idx = old.findIndex((x) => x.id === id);
              const include = rowVisibleForClient(next, clientUserId);
              if (!include) {
                if (idx === -1) return old;
                return old.filter((x) => x.id !== id);
              }
              if (idx === -1) return sortOrdersNewestFirst([...old, next]);
              const copy = [...old];
              copy[idx] = next;
              return sortOrdersNewestFirst(copy);
            });
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, enabled, channelName, postgresChangesFilter, setOrders, clientUserId]);
}
