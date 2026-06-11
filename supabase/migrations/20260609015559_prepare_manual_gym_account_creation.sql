create or replace function app_private.create_gym_account_from_supabase(
  p_owner_email text,
  p_gym_name text,
  p_slug text,
  p_license_type text default 'annual',
  p_license_status text default 'active',
  p_seats integer default 1,
  p_expires_on date default null
)
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  owner_user_id uuid,
  owner_email text,
  owner_role text,
  license_type text,
  license_status text,
  license_seats integer,
  license_expires_on date
)
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_owner_email text;
  v_tenant_id uuid;
  v_gym_name text := trim(coalesce(p_gym_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_license_type text := lower(trim(coalesce(p_license_type, 'annual')));
  v_license_status text := lower(trim(coalesce(p_license_status, 'active')));
  v_seats integer := coalesce(p_seats, 1);
  v_expires_on date;
begin
  if trim(coalesce(p_owner_email, '')) = '' then
    raise exception 'Owner email is required';
  end if;

  if char_length(v_gym_name) < 2 then
    raise exception 'Gym name must have at least 2 characters';
  end if;

  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'Slug must be 3-64 chars using lowercase letters, numbers and hyphens';
  end if;

  if v_license_type not in ('one_time', 'annual') then
    raise exception 'Invalid license type: %', v_license_type;
  end if;

  if v_license_status not in ('trial', 'active', 'expired', 'cancelled') then
    raise exception 'Invalid license status: %', v_license_status;
  end if;

  if v_seats < 1 then
    raise exception 'License seats must be greater than zero';
  end if;

  select u.id, u.email
    into v_owner_user_id, v_owner_email
  from auth.users u
  where lower(u.email) = lower(trim(p_owner_email))
  order by u.created_at asc
  limit 1;

  if v_owner_user_id is null then
    raise exception 'Auth user not found for email %', lower(trim(p_owner_email));
  end if;

  if exists (select 1 from public.tenants t where t.slug = v_slug) then
    raise exception 'Tenant slug already exists: %', v_slug;
  end if;

  v_expires_on := coalesce(
    p_expires_on,
    case
      when v_license_type = 'annual' and v_license_status in ('trial', 'active')
        then (current_date + interval '1 year')::date
      else null
    end
  );

  insert into public.tenants (name, slug, status, created_by)
  values (v_gym_name, v_slug, 'active', v_owner_user_id)
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant_id, v_owner_user_id, 'owner', 'active');

  insert into public.licenses (
    tenant_id,
    license_type,
    status,
    seats,
    starts_on,
    expires_on,
    provider,
    external_reference
  )
  values (
    v_tenant_id,
    v_license_type,
    v_license_status,
    v_seats,
    current_date,
    v_expires_on,
    'supabase_manual',
    v_owner_email
  );

  perform app_private.ensure_default_ledger_accounts(v_tenant_id);
  perform app_private.ensure_default_membership_plans(v_tenant_id);

  return query
  select
    v_tenant_id,
    v_gym_name,
    v_slug,
    v_owner_user_id,
    v_owner_email,
    'owner'::text,
    v_license_type,
    v_license_status,
    v_seats,
    v_expires_on;
end;
$$;

revoke all on function app_private.create_gym_account_from_supabase(
  text,
  text,
  text,
  text,
  text,
  integer,
  date
) from public, anon, authenticated;
