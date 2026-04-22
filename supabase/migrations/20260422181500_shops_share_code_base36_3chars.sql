-- Share code curto (3 chars base36) para links públicos de estabelecimento.
-- Ex.: https://app/?s=7QK

create or replace function public.base36_encode(n bigint)
returns text
language plpgsql
immutable
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  value bigint := n;
  out_text text := '';
begin
  if value < 0 then
    raise exception 'base36_encode only supports non-negative values';
  end if;
  if value = 0 then
    return '0';
  end if;
  while value > 0 loop
    out_text := substr(alphabet, (value % 36)::int + 1, 1) || out_text;
    value := value / 36;
  end loop;
  return out_text;
end;
$$;

alter table public.shops
  add column if not exists share_code text;

-- Backfill determinístico para lojas existentes.
do $$
declare
  max_codes constant integer := 46656; -- 36^3
  total_shops integer;
begin
  select count(*) into total_shops from public.shops;
  if total_shops > max_codes then
    raise exception 'Não há códigos base36 de 3 chars suficientes para % lojas (máximo %).', total_shops, max_codes;
  end if;

  with ranked as (
    select
      id,
      lpad(public.base36_encode(row_number() over (order by created_at, id) - 1), 3, '0') as code
    from public.shops
  )
  update public.shops s
     set share_code = ranked.code
    from ranked
   where s.id = ranked.id
     and (s.share_code is null or btrim(s.share_code) = '');
end
$$;

update public.shops
   set share_code = upper(btrim(share_code))
 where share_code is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'shops_share_code_format_ck'
       and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_share_code_format_ck
      check (share_code ~ '^[0-9A-Z]{3}$');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'shops_share_code_key'
       and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_share_code_key unique (share_code);
  end if;
end
$$;

create or replace function public.next_shop_share_code()
returns text
language plpgsql
volatile
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  loop
    candidate := lpad(public.base36_encode(floor(random() * 46656)::int), 3, '0');
    exit when not exists (
      select 1
        from public.shops s
       where s.share_code = candidate
    );
    attempts := attempts + 1;
    if attempts > 300 then
      raise exception 'Não foi possível gerar share_code único para shops';
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.ensure_shop_share_code()
returns trigger
language plpgsql
as $$
begin
  if new.share_code is null or btrim(new.share_code) = '' then
    new.share_code := public.next_shop_share_code();
  else
    new.share_code := upper(btrim(new.share_code));
  end if;

  if new.share_code !~ '^[0-9A-Z]{3}$' then
    raise exception 'share_code deve ter 3 caracteres base36 (A-Z, 0-9)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shops_ensure_share_code on public.shops;
create trigger trg_shops_ensure_share_code
before insert or update of share_code
on public.shops
for each row
execute function public.ensure_shop_share_code();

alter table public.shops
  alter column share_code set default public.next_shop_share_code();

alter table public.shops
  alter column share_code set not null;
