import type { SupabaseClient } from '@supabase/supabase-js';

export type FinancialAuditRow = {
  shop_id: string;
  actor_user_id?: string | null;
  action: string;
  amount?: number | null;
  result: string;
  asaas_transfer_id?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

export async function insertFinancialAudit(supabase: SupabaseClient, row: FinancialAuditRow): Promise<void> {
  const { error } = await supabase.from('financial_audit_logs').insert({
    shop_id: row.shop_id,
    actor_user_id: row.actor_user_id ?? null,
    action: row.action,
    amount: row.amount ?? null,
    result: row.result,
    asaas_transfer_id: row.asaas_transfer_id ?? null,
    error_message: row.error_message ?? null,
    metadata: row.metadata ?? null,
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
  });
  if (error) {
    console.error('[financial_audit] insert failed', error);
  }
}
