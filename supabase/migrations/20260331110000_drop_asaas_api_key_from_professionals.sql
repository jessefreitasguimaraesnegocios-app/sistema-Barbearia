-- Hardening: não armazenar API key de subconta na tabela professionals.
ALTER TABLE professionals
DROP COLUMN IF EXISTS asaas_api_key;
