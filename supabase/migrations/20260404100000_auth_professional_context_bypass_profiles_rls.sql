-- auth_professional_context() lê public.profiles. Com RLS, o SELECT dentro da função
-- ainda usa o usuário da sessão, reavalia as políticas de profiles e causa 42P17 (recursão).
-- Desliga RLS só durante o corpo desta função SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.auth_professional_context()
RETURNS TABLE(shop_id uuid, professional_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  RETURN QUERY
  SELECT p.shop_id, p.professional_id
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.role = 'profissional';
END;
$$;

REVOKE ALL ON FUNCTION public.auth_professional_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_professional_context() TO authenticated;
