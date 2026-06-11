create or replace function public.record_checkin(
  p_tenant_id uuid,
  p_member_id uuid,
  p_checkin_date date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_checkin_date date := coalesce(p_checkin_date, current_date);
  v_id uuid;
begin
  insert into public.attendance_log (tenant_id, member_id, checkin_date, checkin_time)
  values (p_tenant_id, p_member_id, v_checkin_date, localtime)
  on conflict (tenant_id, member_id, checkin_date)
  do nothing
  returning id into v_id;

  if v_id is null then
    select id
      into v_id
      from public.attendance_log
     where tenant_id = p_tenant_id
       and member_id = p_member_id
       and checkin_date = v_checkin_date;
  end if;

  return v_id;
end;
$$;
