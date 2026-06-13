-- Update record_checkin to support auto-debt for expired members
-- Drop first to avoid "cannot change return type" error if it was previously returns boolean or similar
DROP FUNCTION IF EXISTS public.record_checkin(uuid, uuid, date);

create or replace function public.record_checkin(
  p_tenant_id uuid,
  p_member_id uuid,
  p_checkin_date date default current_date
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_member_record record;
  v_daily_plan_price numeric;
begin
  select * into v_member_record
  from public.members
  where id = p_member_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Member not found';
  end if;

  insert into public.attendance_log (tenant_id, member_id, checkin_date)
  values (p_tenant_id, p_member_id, p_checkin_date)
  on conflict (tenant_id, member_id, checkin_date) do nothing;

  -- Auto-debt logic: if member is expired, charge a daily plan price to their balance.
  -- 0 days remaining means it expires TODAY, so we charge if < p_checkin_date.
  if v_member_record.expiry_date < p_checkin_date then
    select price into v_daily_plan_price
    from public.membership_plans
    where tenant_id = p_tenant_id and plan_key = 'diario'
    limit 1;

    v_daily_plan_price := coalesce(v_daily_plan_price, 5000);

    update public.members
    set balance = balance - v_daily_plan_price,
        updated_at = now()
    where id = p_member_id;

    insert into public.member_membership_events (
      tenant_id, 
      member_id, 
      event_type, 
      plan_key, 
      previous_expiry_date,
      new_expiry_date,
      amount, 
      note
    )
    values (
      p_tenant_id, 
      p_member_id, 
      'manual_adjustment', 
      'diario', 
      v_member_record.expiry_date,
      v_member_record.expiry_date, -- No extension, just a daily charge
      v_daily_plan_price, 
      'Cargo por ingreso con membresia vencida'
    );
  end if;
end;
$$;
