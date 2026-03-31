-- Hardening de segurança:
-- 1) Rate limit server-side reutilizável (RPC) para rotas críticas
-- 2) Anti-replay para eventos de webhook Asaas

CREATE TABLE IF NOT EXISTS api_rate_limits (
  route TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (route, subject, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start
ON api_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS asaas_webhook_receipts (
  event TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event, payment_id)
);

CREATE OR REPLACE FUNCTION security_check_rate_limit(
  p_route TEXT,
  p_subject TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_route IS NULL OR p_subject IS NULL OR p_limit IS NULL OR p_limit <= 0 THEN
    RETURN FALSE;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1)
  );

  INSERT INTO api_rate_limits (route, subject, window_start, request_count, updated_at)
  VALUES (p_route, p_subject, v_window_start, 1, NOW())
  ON CONFLICT (route, subject, window_start)
  DO UPDATE SET
    request_count = api_rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION security_check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security_check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
