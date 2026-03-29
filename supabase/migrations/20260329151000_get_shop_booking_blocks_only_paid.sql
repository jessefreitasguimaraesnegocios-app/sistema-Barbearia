-- Ocupação na grade: apenas agendamentos pagos (marcação após pagamento).
CREATE OR REPLACE FUNCTION public.get_shop_booking_blocks(
  p_shop_id uuid,
  p_date date
)
RETURNS TABLE (
  time_text text,
  duration_minutes integer,
  professional_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(a.time::time, 'HH24:MI') AS time_text,
    GREATEST(15, COALESCE(s.duration, 30))::integer AS duration_minutes,
    a.professional_id
  FROM public.appointments a
  LEFT JOIN public.services s ON s.id = a.service_id
  WHERE a.shop_id = p_shop_id
    AND a.date = p_date
    AND a.status = 'PAID';
$$;

COMMENT ON FUNCTION public.get_shop_booking_blocks IS 'Retorna blocos ocupados só para agendamentos pagos (marcação após pagamento); sem PII.';
