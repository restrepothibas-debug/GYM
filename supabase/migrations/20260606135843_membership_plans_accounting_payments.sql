-- Membership plans, accounting payments and membership events
-- -----------------------------------------------------------
-- This migration moves plan pricing/duration out of React constants and into
-- tenant-scoped database rows. It also adds an auditable payment RPC that can
-- allocate money to membership debt, product credit debt, or both without
-- mixing product receivables into `members.balance`.

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_key text not null,
  name text not null,
  duration_days integer not null check (duration_days > 0),
  price numeric(12, 2) not null check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plan_key),
  check (plan_key ~ '^[a-z0-9_][a-z0-9_-]{0,62}$'),
  check (char_length(trim(name)) >= 2)
);

create index if not exists membership_plans_tenant_active_idx
  on public.membership_plans (tenant_id, active, sort_order, name);

alter table public.membership_plans enable row level security;

drop policy if exists membership_plans_select on public.membership_plans;
drop policy if exists membership_plans_insert on public.membership_plans;
drop policy if exists membership_plans_update on public.membership_plans;

create policy membership_plans_select on public.membership_plans
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy membership_plans_insert on public.membership_plans
  for insert to authenticated
  with check (app_private.has_tenant_admin(tenant_id));

create policy membership_plans_update on public.membership_plans
  for update to authenticated
  using (app_private.has_tenant_admin(tenant_id))
  with check (app_private.has_tenant_admin(tenant_id));

grant select, insert, update on public.membership_plans to authenticated;

create table if not exists public.member_membership_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  event_type text not null check (event_type in ('enrollment', 'renewal', 'manual_adjustment')),
  plan_key text,
  previous_expiry_date date,
  new_expiry_date date not null,
  duration_days integer,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint member_membership_events_member_same_tenant
    foreign key (tenant_id, member_id)
    references public.members (tenant_id, id)
    on delete cascade
);

create index if not exists member_membership_events_tenant_member_idx
  on public.member_membership_events (tenant_id, member_id, created_at desc);

alter table public.member_membership_events enable row level security;

drop policy if exists member_membership_events_select on public.member_membership_events;
drop policy if exists member_membership_events_insert on public.member_membership_events;

create policy member_membership_events_select on public.member_membership_events
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy member_membership_events_insert on public.member_membership_events
  for insert to authenticated
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1
      from public.members m
      where m.id = member_id
        and m.tenant_id = member_membership_events.tenant_id
    )
  );

grant select, insert on public.member_membership_events to authenticated;

create or replace function app_private.ensure_default_membership_plans(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not app_private.has_tenant_admin(target_tenant_id) then
    raise exception 'Tenant admin required';
  end if;

  insert into public.membership_plans (
    tenant_id,
    plan_key,
    name,
    duration_days,
    price,
    sort_order
  )
  values
    (target_tenant_id, 'diario', 'Pase Diario', 1, 5000, 10),
    (target_tenant_id, 'semanal', 'Plan Semanal', 7, 20000, 20),
    (target_tenant_id, 'mensual', 'Mensualidad', 30, 60000, 30),
    (target_tenant_id, 'trimestral', 'Plan Trimestral', 90, 150000, 40),
    (target_tenant_id, 'anual', 'Plan Anual', 365, 500000, 50)
  on conflict (tenant_id, plan_key) do update
    set name = excluded.name,
        duration_days = excluded.duration_days,
        price = excluded.price,
        sort_order = excluded.sort_order,
        active = true,
        updated_at = now();
end;
$$;

grant execute on function app_private.ensure_default_membership_plans(uuid) to authenticated;

do $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in select id from public.tenants
  loop
    perform app_private.ensure_default_membership_plans(v_tenant_id);
  end loop;
end $$;

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

  perform app_private.ensure_default_ledger_accounts(v_tenant_id);
  perform app_private.ensure_default_membership_plans(v_tenant_id);

  return v_tenant_id;
end;
$$;

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
  v_plan public.membership_plans%rowtype;
  v_initial_payment numeric(12, 2) := round(coalesce(p_initial_balance, 0), 2);
  v_plan_price numeric(12, 2);
  v_expiry_date date;
  v_receivable numeric(12, 2);
  v_customer_credit numeric(12, 2);
  v_entries jsonb := '[]'::jsonb;
begin
  -- The plan catalog is now the source of truth for duration and price.
  -- p_plan_price/p_expiry_date remain in the signature for backward
  -- compatibility with existing clients, but new accounting uses the tenant row.
  select *
  into v_plan
  from public.membership_plans
  where tenant_id = p_tenant_id
    and plan_key = p_plan
    and active = true;

  if not found then
    raise exception 'Invalid or inactive plan';
  end if;

  v_plan_price := round(coalesce(v_plan.price, p_plan_price, 0), 2);
  v_expiry_date := current_date + v_plan.duration_days;

  if v_plan_price < 0 or v_initial_payment < 0 then
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
    v_initial_payment - v_plan_price,
    p_plan,
    v_expiry_date
  )
  returning id into v_member_id;

  insert into public.member_membership_events (
    tenant_id,
    member_id,
    event_type,
    plan_key,
    previous_expiry_date,
    new_expiry_date,
    duration_days,
    amount,
    note
  )
  values (
    p_tenant_id,
    v_member_id,
    'enrollment',
    p_plan,
    null,
    v_expiry_date,
    v_plan.duration_days,
    v_plan_price,
    'Inscripcion inicial'
  );

  if v_plan_price > 0 or v_initial_payment > 0 then
    v_receivable := greatest(v_plan_price - v_initial_payment, 0);
    v_customer_credit := greatest(v_initial_payment - v_plan_price, 0);

    if v_initial_payment > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'cash',
        'debit', v_initial_payment,
        'credit', 0,
        'member_id', v_member_id,
        'memo', 'Pago inicial'
      ));
    end if;

    if v_receivable > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'accounts_receivable',
        'debit', v_receivable,
        'credit', 0,
        'member_id', v_member_id,
        'memo', 'Saldo pendiente de membresia'
      ));
    end if;

    if v_plan_price > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'membership_revenue',
        'debit', 0,
        'credit', v_plan_price,
        'member_id', v_member_id,
        'memo', 'Venta de membresia'
      ));
    end if;

    if v_customer_credit > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'customer_credits',
        'debit', 0,
        'credit', v_customer_credit,
        'member_id', v_member_id,
        'memo', 'Credito a favor del socio'
      ));
    end if;

    perform app_private.post_ledger_transaction(
      p_tenant_id,
      'members',
      v_member_id,
      'Inscripcion de socio: ' || trim(p_name),
      v_entries
    );
  end if;

  if v_initial_payment > 0 then
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
      v_initial_payment,
      'Abono inicial de ' || trim(p_name)
    );
  end if;

  return v_member_id;
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
  v_plan public.membership_plans%rowtype;
  v_price numeric(12, 2);
  v_previous_expiry date;
  v_new_expiry date;
  v_previous_balance numeric(12, 2);
  v_credit_used numeric(12, 2);
  v_receivable numeric(12, 2);
  v_entries jsonb := '[]'::jsonb;
begin
  -- Renewal uses the tenant plan catalog as source of truth. The duration/price
  -- parameters are kept only for compatibility with older clients.
  select *
  into v_plan
  from public.membership_plans
  where tenant_id = p_tenant_id
    and plan_key = p_plan
    and active = true;

  if not found then
    raise exception 'Invalid or inactive plan';
  end if;

  v_price := round(coalesce(v_plan.price, p_price, 0), 2);

  if v_plan.duration_days <= 0 or v_price < 0 then
    raise exception 'Invalid renewal values';
  end if;

  select balance, expiry_date
  into v_previous_balance, v_previous_expiry
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_new_expiry := greatest(v_previous_expiry, current_date) + v_plan.duration_days;

  update public.members
  set plan = p_plan,
      expiry_date = v_new_expiry,
      balance = balance - v_price,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id;

  insert into public.member_membership_events (
    tenant_id,
    member_id,
    event_type,
    plan_key,
    previous_expiry_date,
    new_expiry_date,
    duration_days,
    amount,
    note
  )
  values (
    p_tenant_id,
    p_member_id,
    'renewal',
    p_plan,
    v_previous_expiry,
    v_new_expiry,
    v_plan.duration_days,
    v_price,
    'Renovacion de membresia'
  );

  if v_price > 0 then
    v_credit_used := least(greatest(v_previous_balance, 0), v_price);
    v_receivable := v_price - v_credit_used;

    if v_credit_used > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'customer_credits',
        'debit', v_credit_used,
        'credit', 0,
        'member_id', p_member_id,
        'memo', 'Uso de credito del socio'
      ));
    end if;

    if v_receivable > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'accounts_receivable',
        'debit', v_receivable,
        'credit', 0,
        'member_id', p_member_id,
        'memo', 'Renovacion pendiente de pago'
      ));
    end if;

    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'membership_revenue',
      'debit', 0,
      'credit', v_price,
      'member_id', p_member_id,
      'memo', 'Renovacion de membresia'
    ));

    perform app_private.post_ledger_transaction(
      p_tenant_id,
      'members',
      p_member_id,
      'Renovacion de membresia',
      v_entries
    );
  end if;

  return v_new_expiry;
end;
$$;

create or replace function public.adjust_member_membership_days(
  p_tenant_id uuid,
  p_member_id uuid,
  p_day_delta integer,
  p_reason text default null
)
returns date
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_expiry date;
  v_base_expiry date;
  v_new_expiry date;
begin
  if p_day_delta = 0 or abs(p_day_delta) > 3650 then
    raise exception 'Invalid day adjustment';
  end if;

  select expiry_date
  into v_previous_expiry
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  -- Positive adjustments extend from the later of current expiry/today so an
  -- expired account can be reactivated predictably. Negative adjustments always
  -- subtract from the stored expiry because they are administrative corrections.
  v_base_expiry := case
    when p_day_delta > 0 then greatest(v_previous_expiry, current_date)
    else v_previous_expiry
  end;
  v_new_expiry := v_base_expiry + p_day_delta;

  update public.members
  set expiry_date = v_new_expiry,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id;

  insert into public.member_membership_events (
    tenant_id,
    member_id,
    event_type,
    plan_key,
    previous_expiry_date,
    new_expiry_date,
    duration_days,
    amount,
    note
  )
  values (
    p_tenant_id,
    p_member_id,
    'manual_adjustment',
    null,
    v_previous_expiry,
    v_new_expiry,
    p_day_delta,
    0,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  return v_new_expiry;
end;
$$;

create or replace function public.record_member_payment_allocated(
  p_tenant_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_target text default 'auto',
  p_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_remaining numeric(12, 2);
  v_previous_balance numeric(12, 2);
  v_member_name text;
  v_cash_flow_id uuid;
  v_membership_applied numeric(12, 2) := 0;
  v_product_applied numeric(12, 2) := 0;
  v_customer_credit numeric(12, 2) := 0;
  v_purchase record;
  v_purchase_due numeric(12, 2);
  v_purchase_apply numeric(12, 2);
  v_new_paid numeric(12, 2);
  v_entries jsonb;
begin
  if v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_target not in ('auto', 'membership', 'products') then
    raise exception 'Invalid payment target';
  end if;

  select balance, name
  into v_previous_balance, v_member_name
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_remaining := v_amount;

  if p_target in ('auto', 'membership') then
    v_membership_applied := least(v_remaining, greatest(-v_previous_balance, 0));
    v_remaining := v_remaining - v_membership_applied;
  end if;

  if p_target in ('auto', 'products') then
    for v_purchase in
      select id, sale_total, amount_paid
      from public.member_purchases
      where tenant_id = p_tenant_id
        and member_id = p_member_id
        and payment_status in ('credit', 'assigned')
        and sale_total > amount_paid
      order by purchased_at asc, id asc
      for update
    loop
      exit when v_remaining <= 0;

      v_purchase_due := round(v_purchase.sale_total - v_purchase.amount_paid, 2);
      v_purchase_apply := least(v_remaining, v_purchase_due);
      v_new_paid := round(v_purchase.amount_paid + v_purchase_apply, 2);

      update public.member_purchases
      set amount_paid = v_new_paid,
          payment_status = case
            when v_new_paid >= sale_total then 'paid'
            else 'credit'
          end
      where id = v_purchase.id
        and tenant_id = p_tenant_id;

      v_product_applied := v_product_applied + v_purchase_apply;
      v_remaining := v_remaining - v_purchase_apply;
    end loop;
  end if;

  if p_target = 'products' and v_remaining > 0 then
    v_membership_applied := least(v_remaining, greatest(-v_previous_balance, 0));
    v_remaining := v_remaining - v_membership_applied;
  end if;

  v_customer_credit := greatest(v_remaining, 0);

  if v_membership_applied > 0 or v_customer_credit > 0 then
    update public.members
    set balance = balance + v_membership_applied + v_customer_credit,
        updated_at = now()
    where tenant_id = p_tenant_id
      and id = p_member_id;
  end if;

  insert into public.cash_flow (tenant_id, member_id, type, amount, description)
  values (
    p_tenant_id,
    p_member_id,
    'ingreso',
    v_amount,
    coalesce(nullif(trim(p_description), ''), 'Pago de socio (' || p_target || '): ' || v_member_name)
  )
  returning id into v_cash_flow_id;

  v_entries := jsonb_build_array(jsonb_build_object(
    'account', 'cash',
    'debit', v_amount,
    'credit', 0,
    'member_id', p_member_id,
    'memo', 'Pago recibido'
  ));

  if v_membership_applied + v_product_applied > 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'accounts_receivable',
      'debit', 0,
      'credit', v_membership_applied + v_product_applied,
      'member_id', p_member_id,
      'memo', 'Pago aplicado a cartera'
    ));
  end if;

  if v_customer_credit > 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'customer_credits',
      'debit', 0,
      'credit', v_customer_credit,
      'member_id', p_member_id,
      'memo', 'Credito a favor del socio'
    ));
  end if;

  perform app_private.post_ledger_transaction(
    p_tenant_id,
    'cash_flow',
    v_cash_flow_id,
    coalesce(nullif(trim(p_description), ''), 'Pago de socio: ' || v_member_name),
    v_entries
  );

  return jsonb_build_object(
    'membership_applied', v_membership_applied,
    'product_applied', v_product_applied,
    'customer_credit', v_customer_credit,
    'cash_flow_id', v_cash_flow_id
  );
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
  perform public.record_member_payment_allocated(
    p_tenant_id,
    p_member_id,
    p_amount,
    'membership',
    p_description
  );
end;
$$;

grant execute on function public.create_tenant_for_current_user(text, text, text) to authenticated;
grant execute on function public.create_member(uuid, text, text, text, text, date, numeric, numeric) to authenticated;
grant execute on function public.renew_member_plan(uuid, uuid, text, integer, numeric) to authenticated;
grant execute on function public.adjust_member_membership_days(uuid, uuid, integer, text) to authenticated;
grant execute on function public.record_member_payment_allocated(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.record_payment(uuid, uuid, numeric, text) to authenticated;

comment on table public.membership_plans is
  'Tenant-scoped membership plan catalog used as the source of truth for plan price and duration.';
comment on table public.member_membership_events is
  'Audit trail for enrollment, renewal and manual membership day adjustments.';
comment on function public.record_member_payment_allocated(uuid, uuid, numeric, text, text) is
  'Records a member payment and allocates it to membership debt, product credit debt, or both. Product payments update member_purchases and never mutate members.balance except for excess customer credit.';
comment on function public.adjust_member_membership_days(uuid, uuid, integer, text) is
  'Audited administrative adjustment for adding or subtracting membership days without posting accounting revenue.';
