-- Remove agendamentos COMPLETED após o fim do dia do serviço (calendário America/Sao_Paulo).
-- Requer extensão pg_cron (Supabase: Database > Extensions > pg_cron).

DO $$
DECLARE
  jid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron não está instalado: ative em Database > Extensions e volte a aplicar esta migration ou crie o job manualmente.';
    RETURN;
  END IF;

  SELECT j.jobid INTO jid FROM cron.job j WHERE j.jobname = 'purge_completed_appointments_after_service_day_brt';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;

  PERFORM cron.schedule(
    'purge_completed_appointments_after_service_day_brt',
    '8 * * * *',
    $cron$
    DELETE FROM public.appointments a
    WHERE a.status = 'COMPLETED'
      AND a.date < ((now() AT TIME ZONE 'America/Sao_Paulo')::date);
    $cron$
  );
END $$;
