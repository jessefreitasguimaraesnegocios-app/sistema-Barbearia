-- Evita duplicidade de pagamento/registro em retries e duplo clique.
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS payment_idempotency_key TEXT;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_payment_idempotency_key
ON appointments(payment_idempotency_key)
WHERE payment_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_idempotency_key
ON orders(payment_idempotency_key)
WHERE payment_idempotency_key IS NOT NULL;

COMMENT ON COLUMN appointments.payment_idempotency_key IS
'Chave de idempotência para criação de cobrança/agendamento; evita duplicidade.';

COMMENT ON COLUMN orders.payment_idempotency_key IS
'Chave de idempotência para criação de cobrança/pedido; evita duplicidade.';
