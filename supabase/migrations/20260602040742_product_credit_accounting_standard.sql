alter table public.member_purchases
  drop constraint if exists member_purchases_payment_method_check;

alter table public.member_purchases
  add constraint member_purchases_payment_method_check
  check (payment_method in ('credito', 'asignado', 'monedero', 'efectivo', 'tarjeta'));

alter table public.member_purchases
  drop constraint if exists member_purchases_payment_status_check;

alter table public.member_purchases
  add constraint member_purchases_payment_status_check
  check (payment_status in ('credit', 'assigned', 'paid', 'legacy_balance_charge'));

update public.member_purchases
set
  payment_method = 'credito',
  payment_status = 'credit'
where payment_method = 'asignado'
  and payment_status = 'assigned';

comment on column public.member_purchases.payment_method is
  'Standard values: credito, efectivo, tarjeta. asignado and monedero are accepted only as legacy inputs.';

comment on column public.member_purchases.payment_status is
  'Product accounting state. credit means an unpaid product receivable; paid means immediate payment; legacy_balance_charge is retained for old records that affected members.balance.';

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
  v_paid_amount numeric(12, 2);
  v_purchase_id uuid;
  v_payment_method text;
  v_payment_status text;
  v_entries jsonb := '[]'::jsonb;
begin
  if p_payment_method not in ('credito', 'asignado', 'monedero', 'efectivo', 'tarjeta') then
    raise exception 'Invalid payment method';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  -- Fixed accounting standard:
  -- credito/asignado/monedero create a product receivable, never a members.balance change.
  -- efectivo/tarjeta are immediate payments and enter cash/card clearing plus product revenue.
  v_payment_method := case
    when p_payment_method in ('asignado', 'monedero') then 'credito'
    else p_payment_method
  end;
  v_payment_status := case
    when v_payment_method in ('efectivo', 'tarjeta') then 'paid'
    else 'credit'
  end;

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

  perform 1
  from public.members
  where tenant_id = p_tenant_id
    and id = p_member_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;

  v_total := round(v_product.price * p_quantity, 2);
  v_paid_amount := case when v_payment_status = 'paid' then v_total else 0 end;

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
    sale_total,
    amount_paid,
    payment_status,
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
    v_total,
    v_paid_amount,
    v_payment_status,
    v_payment_method
  )
  returning id into v_purchase_id;

  if v_payment_method = 'tarjeta' then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'card_clearing',
      'debit', v_total,
      'credit', 0,
      'member_id', p_member_id,
      'memo', 'Venta con tarjeta'
    ));
  elsif v_payment_method = 'efectivo' then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'cash',
      'debit', v_total,
      'credit', 0,
      'member_id', p_member_id,
      'memo', 'Venta en efectivo'
    ));
  else
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account', 'accounts_receivable',
      'debit', v_total,
      'credit', 0,
      'member_id', p_member_id,
      'memo', 'Producto a credito'
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
    'Venta de producto: ' || v_product.name || ' (' || v_payment_method || ')',
    v_entries
  );

  if v_payment_status = 'paid' then
    insert into public.cash_flow (tenant_id, member_id, type, amount, description)
    values (
      p_tenant_id,
      p_member_id,
      'ingreso',
      v_total,
      'Product sale: ' || v_product.name || ' (' || v_payment_method || ')'
    );
  end if;

  return v_purchase_id;
end;
$$;

comment on function public.sell_product(uuid, uuid, uuid, text, integer) is
  'Assigns or sells a product transactionally. Product credit records member_purchases plus accounts_receivable/product_revenue and never changes members.balance. Immediate cash/card payment records cash_flow plus balanced ledger entries. Legacy asignado/monedero inputs normalize to credito.';

grant execute on function public.sell_product(uuid, uuid, uuid, text, integer) to authenticated;
