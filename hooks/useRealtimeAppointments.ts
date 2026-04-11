import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appointment } from '../types';
import { mapRowToAppointment } from '../services/supabase/appointmentMapping';

export type RealtimeAppointmentsSortMode = 'partner' | 'client';

function sortAppointments(list: Appointment[], mode: RealtimeAppointmentsSortMode): Appointment[] {
  const out = [...list];
  out.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return mode === 'partner' ? dc : -dc;
    const tc = a.time.localeCompare(b.time);
    return mode === 'partner' ? tc : -tc;
  });
  return out;
}

function rowVisibleForSubscription(
  row: Appointment,
  opts: { staffProfessionalId?: string; clientUserId?: string }
): boolean {
  if (opts.staffProfessionalId && row.professionalId !== opts.staffProfessionalId) return false;
  if (opts.clientUserId && row.clientId !== opts.clientUserId) return false;
  return true;
}

export type UseRealtimeAppointmentsParams = {
  client: SupabaseClient;
  /** Quando false, não subscreve (ex.: sem shopId / userId). */
  enabled: boolean;
  /** Nome único do canal (ex.: incluir shopId ou userId). */
  channelName: string;
  /** Filtro Realtime `col=eq.val` (obrigatório quando enabled). */
  postgresChangesFilter: string;
  sortMode: RealtimeAppointmentsSortMode;
  setAppointments: Dispatch<SetStateAction<Appointment[]>>;
  /** STAFF: ignorar linhas de outros profissionais (defesa em profundidade além do RLS). */
  staffProfessionalId?: string;
  /** CLIENTE: remover da lista se `client_id` deixar de ser o utilizador. */
  clientUserId?: string;
};

/**
 * Supabase Realtime `postgres_changes` em `public.appointments` com merge local
 * (INSERT ordenado, UPDATE por id, DELETE por id) — sem refetch completo por evento.
 */
export function useRealtimeAppointments(params: UseRealtimeAppointmentsParams): void {
  const {
    client,
    enabled,
    channelName,
    postgresChangesFilter,
    sortMode,
    setAppointments,
    staffProfessionalId,
    clientUserId,
  } = params;

  useEffect(() => {
    if (!enabled || !postgresChangesFilter) return;

    const scope = { staffProfessionalId, clientUserId };

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: postgresChangesFilter,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Record<string, unknown> | undefined;
            const id = oldRow?.id != null ? String(oldRow.id) : '';
            if (!id) return;
            setAppointments((old) => old.filter((x) => x.id !== id));
            return;
          }

          const rawNew = payload.new as Record<string, unknown> | undefined;
          if (!rawNew || rawNew.id == null) return;
          const next = mapRowToAppointment(rawNew);

          if (payload.eventType === 'INSERT') {
            if (!rowVisibleForSubscription(next, scope)) return;
            setAppointments((old) => {
              if (old.some((x) => x.id === next.id)) {
                return sortAppointments(
                  old.map((x) => (x.id === next.id ? next : x)),
                  sortMode
                );
              }
              return sortAppointments([...old, next], sortMode);
            });
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setAppointments((old) => {
              const id = next.id;
              const idx = old.findIndex((x) => x.id === id);
              const include = rowVisibleForSubscription(next, scope);
              if (!include) {
                if (idx === -1) return old;
                return old.filter((x) => x.id !== id);
              }
              if (idx === -1) return sortAppointments([...old, next], sortMode);
              const copy = [...old];
              copy[idx] = next;
              return sortAppointments(copy, sortMode);
            });
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [
    client,
    enabled,
    channelName,
    postgresChangesFilter,
    sortMode,
    setAppointments,
    staffProfessionalId,
    clientUserId,
  ]);
}
