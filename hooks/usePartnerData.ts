import { useState, useEffect, useCallback } from 'react';
import type { Appointment, ShopPartnerOrderRow } from '../types';
import { supabase } from '../src/lib/supabase';
import { loadPartnerShopActivity, fetchPartnerAppointments } from '../services/supabase/partnerShopActivity';

/** Agenda + pedidos da loja (parceiro), com filtro opcional por profissional (STAFF). */
export function usePartnerData(shopId: string | undefined, staffProfessionalId: string | undefined) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [shopPartnerOrderRows, setShopPartnerOrderRows] = useState<ShopPartnerOrderRow[]>([]);

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
