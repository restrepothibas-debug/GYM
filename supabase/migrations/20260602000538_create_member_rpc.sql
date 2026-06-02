create or replace function public.create_member(
  p_tenant_id uuid,
  p_name text,
  p_doc text,
  p_phone text default null,
  p_plan text default 'mensual',
  p_expiry_date date default current_date,
  p_plan_price numeric default 0,
  p_initial_balance numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_initial_balance numeric(12, 2) := coalesce(p_initial_balance, 0);
  v_plan_price numeric(12, 2) := coalesce(p_plan_price, 0);
begin
  -- Contract: p_initial_balance is the payment received during enrollment,
  -- despite the legacy name. It is not a wallet top-up.
  -- Resulting member balance = payment - plan price.
  if p_plan not in ('diario', 'semanal', 'mensual', 'trimestral', 'anual') then
    raise exception 'Invalid plan';
  end if;

  if v_plan_price < 0 or v_initial_balance < 0 then
    raise exception 'Invalid financial values';
  end if;

  insert into public.members (
    tenant_id,
    name,
    doc,
    phone,
    balance,
    plan,
    expiry_date
  )
  values (
    p_tenant_id,
    trim(p_name),
    trim(p_doc),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_initial_balance - v_plan_price,
    p_plan,
    p_expiry_date
  )
  returning id into v_member_id;

  if v_initial_balance > 0 then
    insert into public.cash_flow (
      tenant_id,
      member_id,
      type,
      amount,
      description
    )
    values (
      p_tenant_id,
      v_member_id,
      'ingreso',
      v_initial_balance,
      'Abono inicial de ' || trim(p_name)
    );
  end if;

  return v_member_id;
end;
$$;

grant execute on function public.create_member(uuid, text, text, text, text, date, numeric, numeric) to authenticated;
