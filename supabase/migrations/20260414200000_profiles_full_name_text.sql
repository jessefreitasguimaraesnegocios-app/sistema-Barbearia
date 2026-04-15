-- Nome completo no perfil: garantir TEXT (evita VARCHAR curto ex.: 23 chars em ambientes antigos).
ALTER TABLE public.profiles
  ALTER COLUMN full_name TYPE text USING full_name::text;

COMMENT ON COLUMN public.profiles.full_name IS
  'Nome exibido na cobrança PIX; texto longo (sem limite artificial curto).';
