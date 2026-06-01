-- GymFlow production schema
-- Multi-tenant, RLS-first, ACID-safe operations through Postgres functions.

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  license_type text not null check (license_type in ('one_time', 'annual')),
  status text not null default 'active' check (status in ('trial', 'active', 'expired', 'cancelled')),
  seats integer not null default 1 check (seats > 0),
  starts_on date not null default current_date,
  expires_on date,
  provider text,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  doc text not null,
  phone text,
  balance numeric(12, 2) not null default 0,
  plan text not null check (plan in ('diario', 'semanal', 'mensual', 'trimestral', 'anual')),
  expiry_date date not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  checkin_date date not null default current_date,
  checkin_time time not null default localtime,
  created_at timestamptz not null default now(),
  unique (tenant_id, member_id, checkin_date)
);

create table public.member_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  total_paid numeric(12, 2) not null check (total_paid >= 0),
  payment_method text not null check (payment_method in ('monedero', 'efectivo', 'tarjeta')),
  purchased_at timestamptz not null default now()
);

create table public.cash_flow (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  type text not null check (type in ('ingreso', 'egreso')),
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index tenant_memberships_user_idx on public.tenant_memberships (user_id, status);
create index licenses_tenant_status_idx on public.licenses (tenant_id, status);
create index members_tenant_status_idx on public.members (tenant_id, status);
create index products_tenant_status_idx on public.products (tenant_id, status);
create index attendance_tenant_date_idx on public.attendance_log (tenant_id, checkin_date desc);
create index attendance_member_idx on public.attendance_log (member_id);
create index purchases_tenant_member_idx on public.member_purchases (tenant_id, member_id, purchased_at desc);
create index cash_flow_tenant_date_idx on public.cash_flow (tenant_id, date desc, created_at desc);

create or replace function app_private.current_tenant_role(target_tenant_id uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select tm.role
  from public.tenant_memberships tm
  where tm.tenant_id = target_tenant_id
    and tm.user_id = auth.uid()
    and tm.status = 'active'
  limit 1
$$;

create or replace function app_private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select app_private.current_tenant_role(target_tenant_id) is not null
$$;

create or replace function app_private.has_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select app_private.current_tenant_role(target_tenant_id) in ('owner', 'admin')
$$;

grant execute on function app_private.current_tenant_role(uuid) to authenticated;
grant execute on function app_private.has_tenant_access(uuid) to authenticated;
grant execute on function app_private.has_tenant_admin(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.licenses enable row level security;
alter table public.members enable row level security;
alter table public.products enable row level security;
alter table public.attendance_log enable row level security;
alter table public.member_purchases enable row level security;
alter table public.cash_flow enable row level security;

create policy tenants_select on public.tenants
  for select to authenticated
  using (created_by = auth.uid() or app_private.has_tenant_access(id));

create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (created_by = auth.uid());

create policy tenants_update_admin on public.tenants
  for update to authenticated
  using (app_private.has_tenant_admin(id))
  with check (app_private.has_tenant_admin(id));

create policy memberships_select on public.tenant_memberships
  for select to authenticated
  using (user_id = auth.uid() or app_private.has_tenant_admin(tenant_id));

create policy memberships_insert on public.tenant_memberships
  for insert to authenticated
  with check (
    app_private.has_tenant_admin(tenant_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.tenants t
        where t.id = tenant_id
          and t.created_by = auth.uid()
      )
    )
  );

create policy memberships_update_admin on public.tenant_memberships
  for update to authenticated
  using (app_private.has_tenant_admin(tenant_id))
  with check (app_private.has_tenant_admin(tenant_id));

create policy memberships_delete_admin on public.tenant_memberships
  for delete to authenticated
  using (app_private.has_tenant_admin(tenant_id));

create policy licenses_select on public.licenses
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy licenses_write_admin on public.licenses
  for all to authenticated
  using (app_private.has_tenant_admin(tenant_id))
  with check (app_private.has_tenant_admin(tenant_id));

create policy members_select on public.members
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy members_write on public.members
  for all to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

create policy products_select on public.products
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy products_write on public.products
  for all to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

create policy attendance_select on public.attendance_log
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy attendance_write on public.attendance_log
  for all to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = attendance_log.tenant_id
    )
  );

create policy purchases_select on public.member_purchases
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy purchases_write on public.member_purchases
  for all to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = member_purchases.tenant_id
    )
  );

create policy cash_flow_select on public.cash_flow
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy cash_flow_write on public.cash_flow
  for all to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.tenant_memberships to authenticated;
grant select, insert, update, delete on public.licenses to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.attendance_log to authenticated;
grant select, insert, update, delete on public.member_purchases to authenticated;
grant select, insert, update, delete on public.cash_flow to authenticated;

create or replace function public.create_tenant_for_current_user(
  p_name text,
  p_slug text,
  p_license_type text default 'annual'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_license_type text := coalesce(p_license_type, 'annual');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_license_type not in ('one_time', 'annual') then
    raise exception 'Invalid license type';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant_id, auth.uid(), 'owner');

  insert into public.licenses (tenant_id, license_type, status, starts_on, expires_on)
  values (
    v_tenant_id,
    v_license_type,
    'active',
    current_date,
    case when v_license_type = 'annual' then (current_date + interval '1 year')::date else null end
  );

  return v_tenant_id;
end;
$$;

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
  v_id uuid;
begin
  insert into public.attendance_log (tenant_id, member_id, checkin_date, checkin_time)
  values (p_tenant_id, p_member_id, coalesce(p_checkin_date, current_date), localtime)
  on conflict (tenant_id, member_id, checkin_date)
  do update set checkin_time = excluded.checkin_time
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_payment(
  p_tenant_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_description text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  update public.members
  set balance = balance + p_amount,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id;

  if not found then
    raise exception 'Member not found';
  end if;

  insert into public.cash_flow (tenant_id, member_id, type, amount, description)
  values (
    p_tenant_id,
    p_member_id,
    'ingreso',
    p_amount,
    coalesce(p_description, 'Member payment')
  );
end;
$$;

create or replace function public.renew_member_plan(
  p_tenant_id uuid,
  p_member_id uuid,
  p_plan text,
  p_duration_days integer,
  p_price numeric
)
returns date
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_new_expiry date;
begin
  if p_plan not in ('diario', 'semanal', 'mensual', 'trimestral', 'anual') then
    raise exception 'Invalid plan';
  end if;

  if p_duration_days <= 0 or p_price < 0 then
    raise exception 'Invalid renewal values';
  end if;

  update public.members
  set plan = p_plan,
      expiry_date = greatest(expiry_date, current_date) + p_duration_days,
      balance = balance - p_price,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id
  returning expiry_date into v_new_expiry;

  if v_new_expiry is null then
    raise exception 'Member not found';
  end if;

  return v_new_expiry;
end;
$$;

create or replace function public.sell_product(
  p_tenant_id uuid,
  p_member_id uuid,
  p_product_id uuid,
  p_payment_method text,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_total numeric(12, 2);
  v_purchase_id uuid;
begin
  if p_payment_method not in ('monedero', 'efectivo', 'tarjeta') then
    raise exception 'Invalid payment method';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select *
  into v_product
  from public.products
  where tenant_id = p_tenant_id
    and id = p_product_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.stock < p_quantity then
    raise exception 'Insufficient stock';
  end if;

  if not exists (
    select 1 from public.members
    where tenant_id = p_tenant_id
      and id = p_member_id
      and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  v_total := v_product.price * p_quantity;

  update public.products
  set stock = stock - p_quantity,
      updated_at = now()
  where id = p_product_id
    and tenant_id = p_tenant_id;

  insert into public.member_purchases (
    tenant_id,
    member_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_paid,
    payment_method
  )
  values (
    p_tenant_id,
    p_member_id,
    p_product_id,
    v_product.name,
    p_quantity,
    v_product.price,
    v_total,
    p_payment_method
  )
  returning id into v_purchase_id;

  if p_payment_method = 'monedero' then
    update public.members
    set balance = balance - v_total,
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = p_member_id;
  else
    insert into public.cash_flow (tenant_id, member_id, type, amount, description)
    values (
      p_tenant_id,
      p_member_id,
      'ingreso',
      v_total,
      'Product sale: ' || v_product.name || ' (' || p_payment_method || ')'
    );
  end if;

  return v_purchase_id;
end;
$$;

grant execute on function public.create_tenant_for_current_user(text, text, text) to authenticated;
grant execute on function public.record_checkin(uuid, uuid, date) to authenticated;
grant execute on function public.record_payment(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.renew_member_plan(uuid, uuid, text, integer, numeric) to authenticated;
grant execute on function public.sell_product(uuid, uuid, uuid, text, integer) to authenticated;
