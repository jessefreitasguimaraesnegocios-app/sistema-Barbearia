-- Agregados do painel admin calculados no banco (menos bytes que trazer toda a lista).

create or replace function public.get_admin_shops_aggregate_stats()
returns table (
  total_shops bigint,
  active_subscriptions bigint,
  mrr_estimate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as total_shops,
    count(*) filter (where subscription_active)::bigint as active_subscriptions,
    coalesce(sum(case when subscription_active then coalesce(subscription_amount, 99) else 0 end), 0)::numeric as mrr_estimate
  from public.shops;
$$;

revoke all on function public.get_admin_shops_aggregate_stats() from public;
grant execute on function public.get_admin_shops_aggregate_stats() to authenticated;
