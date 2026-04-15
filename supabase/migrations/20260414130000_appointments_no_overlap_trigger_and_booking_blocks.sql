-- Impede dois agendamentos PENDING/PAID no mesmo profissional com intervalos sobrepostos (concorrência + reagendamento).
-- get_shop_booking_blocks: inclui PENDING para o cliente ver o slot ocupado enquanto o PIX está aberto.

CREATE OR REPLACE FUNCTION public.appointments_enforce_no_overlapping_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_start int;
  new_end int;
  new_dur int;
  conflict_exists boolean;
BEGIN
  IF NEW.professional_id IS NULL OR NEW.shop_id IS NULL OR NEW.date IS NULL OR NEW.time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('PENDING', 'PAID') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    GREATEST(15, COALESCE(s.duration, 30)),
    30
  )::int
  INTO new_dur
  FROM services s
  WHERE NEW.service_id IS NOT NULL AND s.id = NEW.service_id;

  IF new_dur IS NULL THEN
    new_dur := 30;
  END IF;

  new_start := (
    EXTRACT(HOUR FROM NEW.time::time)::int * 60
    + EXTRACT(MINUTE FROM NEW.time::time)::int
  );
  new_end := new_start + new_dur;

  PERFORM pg_advisory_xact_lock(
    hashtext(concat_ws(':', NEW.shop_id::text, NEW.professional_id::text, NEW.date::text))
  );

  SELECT EXISTS (
    SELECT 1
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.shop_id = NEW.shop_id
      AND a.professional_id = NEW.professional_id
      AND a.date = NEW.date
      AND a.status IN ('PENDING', 'PAID')
      AND a.id IS DISTINCT FROM NEW.id
      AND (
        (
          EXTRACT(HOUR FROM a.time::time)::int * 60
          + EXTRACT(MINUTE FROM a.time::time)::int
        )
        < new_end
        AND
        (
          (
            EXTRACT(HOUR FROM a.time::time)::int * 60
            + EXTRACT(MINUTE FROM a.time::time)::int
          )
          + GREATEST(15, COALESCE(s.duration, 30))::int
        ) > new_start
      )
  ) INTO conflict_exists;

  IF conflict_exists THEN
    RAISE EXCEPTION 'Este horário já está ocupado para este profissional. Escolha outro horário.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_enforce_no_overlapping_bookings ON public.appointments;
CREATE TRIGGER appointments_enforce_no_overlapping_bookings
BEFORE INSERT OR UPDATE OF shop_id, professional_id, date, time, service_id, status
ON public.appointments
FOR EACH ROW
EXECUTE PROCEDURE public.appointments_enforce_no_overlapping_bookings();

COMMENT ON FUNCTION public.appointments_enforce_no_overlapping_bookings IS
  'Garante que não existam dois agendamentos PENDING/PAID sobrepostos para o mesmo profissional no mesmo dia; usa advisory lock por (loja, profissional, data).';

-- Ocupação na grade: pagos + pendentes de pagamento (PIX em aberto).
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
    AND a.status IN ('PENDING', 'PAID');
$$;

COMMENT ON FUNCTION public.get_shop_booking_blocks IS
  'Retorna blocos ocupados para agendamentos pagos e pendentes (sem PII).';
