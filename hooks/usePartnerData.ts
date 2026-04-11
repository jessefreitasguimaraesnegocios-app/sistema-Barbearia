import { useState, useEffect, useCallback } from 'react';
import type { Appointment, ShopPartnerOrderRow } from '../types';
import { supabase } from '../src/lib/supabase';
import { loadPartnerShopActivity, fetchPartnerAppointments } from '../services/supabase/partnerShopActivity';
import { useRealtimeAppointments } from './useRealtimeAppointments';

/** Agenda + pedidos da loja (parceiro), com filtro opcional por profissional (STAFF). */
export function usePartnerData(shopId: string | undefined, staffProfessionalId: string | undefined) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [shopPartnerOrderRows, setShopPartnerOrderRows] = useState<ShopPartnerOrderRow[]>([]);

  useRealtimeAppointments({
    client: supabase,
    enabled: Boolean(shopId),
    channelName: `partner-appointments-${shopId ?? 'none'}-${staffProfessionalId ?? 'owner'}`,
    postgresChangesFilter: shopId ? `shop_id=eq.${shopId}` : '',
    sortMode: 'partner',
    setAppointments,
    staffProfessionalId: staffProfessionalId ?? undefined,
  });

  const reloadPartnerData = useCallback(async () => {
    if (!shopId) {
      setAppointments([]);
      setShopPartnerOrderRows([]);
      return;
    }
    const { appointments: nextApt, shopPartnerOrderRows: nextRows } = await loadPartnerShopActivity(
      supabase,
      shopId,
      staffProfessionalId
    );
    setAppointments(nextApt);
    setShopPartnerOrderRows(nextRows);
  }, [shopId, staffProfessionalId]);

  const reloadAppointmentsOnly = useCallback(async () => {
    if (!shopId) {
      setAppointments([]);
      return;
    }
    const next = await fetchPartnerAppointments(supabase, shopId, staffProfessionalId);
    setAppointments(next);
  }, [shopId, staffProfessionalId]);

  useEffect(() => {
    void reloadPartnerData();
  }, [reloadPartnerData]);

  return {
    appointments,
    shopPartnerOrderRows,
    reloadPartnerData,
    reloadAppointmentsOnly,
  };
}
