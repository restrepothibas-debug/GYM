create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  system_key text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, system_key)
);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_table text not null,
  source_id uuid,
  occurred_on date not null default current_date,
  description text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transaction_id uuid not null references public.ledger_transactions(id) on delete cascade,
  account_id uuid not null references public.ledger_accounts(id) on delete restrict,
  member_id uuid references public.members(id) on delete set null,
  debit numeric(12, 2) not null default 0 check (debit >= 0),
  credit numeric(12, 2) not null default 0 check (credit >= 0),
  memo text,
  created_at timestamptz not null default now(),
  check (
    (debit > 0 and credit = 0)
    or (credit > 0 and debit = 0)
  )
);

create index ledger_accounts_tenant_key_idx on public.ledger_accounts (tenant_id, system_key);
create index ledger_transactions_tenant_date_idx on public.ledger_transactions (tenant_id, occurred_on desc, created_at desc);
create index ledger_entries_tenant_transaction_idx on public.ledger_entries (tenant_id, transaction_id);
create index ledger_entries_account_idx on public.ledger_entries (account_id);

alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;

create policy ledger_accounts_select on public.ledger_accounts
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy ledger_transactions_select on public.ledger_transactions
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (app_private.has_tenant_access(tenant_id));

grant select on public.ledger_accounts to authenticated;
grant select on public.ledger_transactions to authenticated;
grant select on public.ledger_entries to authenticated;

create or replace function app_private.ensure_default_ledger_accounts(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not app_private.has_tenant_access(target_tenant_id) then
    raise exception 'Tenant access required';
  end if;

  insert into public.ledger_accounts (tenant_id, code, name, system_key, account_type, normal_balance)
  values
    (target_tenant_id, '1100', 'Caja y efectivo', 'cash', 'asset', 'debit'),
    (target_tenant_id, '1110', 'Tarjetas por cobrar', 'card_clearing', 'asset', 'debit'),
    (target_tenant_id, '1200', 'Cuentas por cobrar socios', 'accounts_receivable', 'asset', 'debit'),
    (target_tenant_id, '2200', 'Creditos de socios', 'customer_credits', 'liability', 'credit'),
    (target_tenant_id, '4100', 'Ingresos por membresias', 'membership_revenue', 'revenue', 'credit'),
    (target_tenant_id, '4200', 'Ingresos por productos', 'product_revenue', 'revenue', 'credit'),
    (target_tenant_id, '4300', 'Otros ingresos', 'other_income', 'revenue', 'credit'),
    (target_tenant_id, '6100', 'Gastos operativos', 'operating_expense', 'expense', 'debit')
  on conflict (tenant_id, system_key) do update
    set active = true,
        name = excluded.name,
        account_type = excluded.account_type,
        normal_balance = excluded.normal_balance;
end;
$$;

create or replace function app_private.post_ledger_transaction(
  p_tenant_id uuid,
  p_source_table text,
  p_source_id uuid,
  p_description text,
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction_id uuid;
  v_entry jsonb;
  v_account_id uuid;
  v_debit numeric(12, 2);
  v_credit numeric(12, 2);
  v_total_debit numeric(12, 2) := 0;
  v_total_credit numeric(12, 2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not app_private.has_tenant_access(p_tenant_id) then
    raise exception 'Tenant access required';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'Ledger transaction requires at least two entries';
  end if;

  perform app_private.ensure_default_ledger_accounts(p_tenant_id);

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_debit := round(coalesce((v_entry ->> 'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_entry ->> 'credit')::numeric, 0), 2);

    if v_debit < 0 or v_credit < 0 or (v_debit = 0 and v_credit = 0) or (v_debit > 0 and v_credit > 0) then
      raise exception 'Invalid ledger entry values';
    end if;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Ledger transaction is not balanced: debit %, credit %', v_total_debit, v_total_credit;
  end if;

  insert into public.ledger_transactions (tenant_id, source_table, source_id, description)
  values (p_tenant_id, p_source_table, p_source_id, p_description)
  returning id into v_transaction_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    select id
    into v_account_id
    from public.ledger_accounts
    where tenant_id = p_tenant_id
      and system_key = v_entry ->> 'account';

    if v_account_id is null then
      raise exception 'Unknown ledger account %', v_entry ->> 'account';
    end if;

    insert into public.ledger_entries (
      tenant_id,
      transaction_id,
      account_id,
      member_id,
      debit,
      credit,
      memo
    )
    values (
      p_tenant_id,
      v_transaction_id,
      v_account_id,
      nullif(v_entry ->> 'member_id', '')::uuid,
      round(coalesce((v_entry ->> 'debit')::numeric, 0), 2),
      round(coalesce((v_entry ->> 'credit')::numeric, 0), 2),
      nullif(v_entry ->> 'memo', '')
    );
  end loop;

  return v_transaction_id;
end;
$$;

grant execute on function app_private.ensure_default_ledger_accounts(uuid) to authenticated;
grant execute on function app_private.post_ledger_transaction(uuid, text, uuid, text, jsonb) to authenticated;

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
  v_initial_balance numeric(12, 2) := round(coalesce(p_initial_balance, 0), 2);
  v_plan_price numeric(12, 2) := round(coalesce(p_plan_price, 0), 2);
  v_receivable numeric(12, 2);
  v_customer_credit numeric(12, 2);
  v_entries jsonb := '[]'::jsonb;
begin
  -- Contract: p_initial_balance is the payment received during enrollment.
  -- It is not a wallet top-up. The resulting member balance is:
  --   payment - plan price
  -- where negative means receivable/debt and positive means customer credit.
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

  if v_plan_price > 0 or v_initial_balance > 0 then
    v_receivable := greatest(v_plan_price - v_initial_balance, 0);
    v_customer_credit := greatest(v_initial_balance - v_plan_price, 0);

    if v_initial_balance > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'cash',
        'debit', v_initial_balance,
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
declare
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_previous_balance numeric(12, 2);
  v_ar_payment numeric(12, 2);
  v_credit_payment numeric(12, 2);
  v_member_name text;
  v_cash_flow_id uuid;
  v_entries jsonb;
begin
  if v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select balance, name
  into v_previous_balance, v_member_name
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  update public.members
  set balance = balance + v_amount,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id;

  v_ar_payment := least(v_amount, greatest(-v_previous_balance, 0));
  v_credit_payment := v_amount - v_ar_payment;

  insert into public.cash_flow (tenant_id, member_id, type, amount, description)
  values (
    p_tenant_id,
    p_member_id,
    'ingreso',
    v_amount,
    coalesce(p_description, 'Member payment')
  )
  returning id into v_cash_flow_id;

  v_entries := jsonb_build_array(jsonb_build_object(
    'account', 'cash',
    'debit', v_amount,
    'credit', 0,
    'member_id', p_member_id,
    'memo', 'Pago recibido'
  ));

  if v_ar_payment > 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'accounts_receivable',
      'debit', 0,
      'credit', v_ar_payment,
      'member_id', p_member_id,
      'memo', 'Pago aplicado a cartera'
    ));
  end if;

  if v_credit_payment > 0 then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'customer_credits',
      'debit', 0,
      'credit', v_credit_payment,
      'member_id', p_member_id,
      'memo', 'Credito a favor del socio'
    ));
  end if;

  perform app_private.post_ledger_transaction(
    p_tenant_id,
    'cash_flow',
    v_cash_flow_id,
    coalesce(p_description, 'Pago de socio: ' || v_member_name),
    v_entries
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
  v_price numeric(12, 2) := round(coalesce(p_price, 0), 2);
  v_new_expiry date;
  v_previous_balance numeric(12, 2);
  v_credit_used numeric(12, 2);
  v_receivable numeric(12, 2);
  v_entries jsonb := '[]'::jsonb;
begin
  if p_plan not in ('diario', 'semanal', 'mensual', 'trimestral', 'anual') then
    raise exception 'Invalid plan';
  end if;

  if p_duration_days <= 0 or v_price < 0 then
    raise exception 'Invalid renewal values';
  end if;

  select balance
  into v_previous_balance
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  update public.members
  set plan = p_plan,
      expiry_date = greatest(expiry_date, current_date) + p_duration_days,
      balance = balance - v_price,
      updated_at = now()
  where tenant_id = p_tenant_id
    and id = p_member_id
  returning expiry_date into v_new_expiry;

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
  v_member_balance numeric(12, 2);
  v_total numeric(12, 2);
  v_purchase_id uuid;
  v_credit_used numeric(12, 2);
  v_receivable numeric(12, 2);
  v_entries jsonb := '[]'::jsonb;
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

  select balance
  into v_member_balance
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_total := round(v_product.price * p_quantity, 2);

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

    v_credit_used := least(greatest(v_member_balance, 0), v_total);
    v_receivable := v_total - v_credit_used;

    if v_credit_used > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'customer_credits',
        'debit', v_credit_used,
        'credit', 0,
        'member_id', p_member_id,
        'memo', 'Uso de monedero'
      ));
    end if;

    if v_receivable > 0 then
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account', 'accounts_receivable',
        'debit', v_receivable,
        'credit', 0,
        'member_id', p_member_id,
        'memo', 'Producto cargado al socio'
      ));
    end if;
  elsif p_payment_method = 'tarjeta' then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'card_clearing',
      'debit', v_total,
      'credit', 0,
      'member_id', p_member_id,
      'memo', 'Venta con tarjeta'
    ));
  else
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'cash',
      'debit', v_total,
      'credit', 0,
      'member_id', p_member_id,
      'memo', 'Venta en efectivo'
    ));
  end if;

  v_entries := v_entries || jsonb_build_array(jsonb_build_object(
    'account', 'product_revenue',
    'debit', 0,
    'credit', v_total,
    'member_id', p_member_id,
    'memo', 'Venta de producto'
  ));

  perform app_private.post_ledger_transaction(
    p_tenant_id,
    'member_purchases',
    v_purchase_id,
    'Venta de producto: ' || v_product.name,
    v_entries
  );

  if p_payment_method <> 'monedero' then
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

create or replace function public.record_cash_movement(
  p_tenant_id uuid,
  p_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_cash_flow_id uuid;
  v_entries jsonb;
begin
  if p_type not in ('ingreso', 'egreso') then
    raise exception 'Invalid cash movement type';
  end if;

  if v_amount <= 0 then
    raise exception 'Cash movement amount must be greater than zero';
  end if;

  insert into public.cash_flow (tenant_id, type, amount, description)
  values (p_tenant_id, p_type, v_amount, nullif(trim(p_description), ''))
  returning id into v_cash_flow_id;

  if p_type = 'ingreso' then
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'cash', 'debit', v_amount, 'credit', 0, 'memo', 'Ingreso general de caja'),
      jsonb_build_object('account', 'other_income', 'debit', 0, 'credit', v_amount, 'memo', 'Ingreso general')
    );
  else
    v_entries := jsonb_build_array(
      jsonb_build_object('account', 'operating_expense', 'debit', v_amount, 'credit', 0, 'memo', 'Gasto operativo'),
      jsonb_build_object('account', 'cash', 'debit', 0, 'credit', v_amount, 'memo', 'Salida de caja')
    );
  end if;

  perform app_private.post_ledger_transaction(
    p_tenant_id,
    'cash_flow',
    v_cash_flow_id,
    coalesce(nullif(trim(p_description), ''), 'Movimiento de caja'),
    v_entries
  );

  return v_cash_flow_id;
end;
$$;

grant execute on function public.create_tenant_for_current_user(text, text, text) to authenticated;
grant execute on function public.create_member(uuid, text, text, text, text, date, numeric, numeric) to authenticated;
grant execute on function public.record_payment(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.renew_member_plan(uuid, uuid, text, integer, numeric) to authenticated;
grant execute on function public.sell_product(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.record_cash_movement(uuid, text, numeric, text) to authenticated;

do $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in select id from public.tenants
  loop
    perform app_private.ensure_default_ledger_accounts(v_tenant_id);
  end loop;
end;
$$;
