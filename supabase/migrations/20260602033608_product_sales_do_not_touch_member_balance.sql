alter table public.member_purchases
  add column if not exists sale_total numeric(12, 2),
  add column if not exists amount_paid numeric(12, 2),
  add column if not exists payment_status text;

update public.member_purchases
set
  sale_total = coalesce(sale_total, total_paid, unit_price * quantity),
  amount_paid = coalesce(
    amount_paid,
    case
      when payment_method in ('efectivo', 'tarjeta') then total_paid
      else 0
    end
  ),
  payment_status = coalesce(
    payment_status,
    case
      when payment_method in ('efectivo', 'tarjeta') then 'paid'
      when payment_method = 'monedero' then 'legacy_balance_charge'
      else 'assigned'
    end
  );

alter table public.member_purchases
  alter column sale_total set not null,
  alter column amount_paid set not null,
  alter column payment_status set not null;

alter table public.member_purchases
  drop constraint if exists member_purchases_payment_method_check;

alter table public.member_purchases
  add constraint member_purchases_payment_method_check
  check (payment_method in ('asignado', 'monedero', 'efectivo', 'tarjeta'));

alter table public.member_purchases
  add constraint member_purchases_sale_total_check
  check (sale_total >= 0);

alter table public.member_purchases
  add constraint member_purchases_amount_paid_check
  check (amount_paid >= 0 and amount_paid <= sale_total);

alter table public.member_purchases
  add constraint member_purchases_payment_status_check
  check (payment_status in ('assigned', 'paid', 'legacy_balance_charge'));

comment on column public.member_purchases.total_paid is
  'Legacy compatibility field. For product purchases it stores the sale total, not necessarily money collected.';

comment on column public.member_purchases.sale_total is
  'Total value of the product assignment or sale.';

comment on column public.member_purchases.amount_paid is
  'Money collected immediately for this product. Assigned products keep this at 0 and never alter members.balance.';

comment on column public.member_purchases.payment_status is
  'Operational product status: assigned, paid, or legacy_balance_charge for old records created before products stopped touching members.balance.';

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
  if p_payment_method not in ('asignado', 'monedero', 'efectivo', 'tarjeta') then
    raise exception 'Invalid payment method';
  end if;

  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  -- Product assignment is operational inventory control. The legacy value
  -- "monedero" is accepted only for backwards compatibility and is normalized
  -- to "asignado"; product operations must never change members.balance.
  v_payment_method := case
    when p_payment_method = 'monedero' then 'asignado'
    else p_payment_method
  end;
  v_payment_status := case
    when v_payment_method in ('efectivo', 'tarjeta') then 'paid'
    else 'assigned'
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
  end if;

  if v_payment_status = 'paid' then
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
  'Assigns or sells a product transactionally. Product assignment/sale always records member_purchases and stock movement; it never changes members.balance. Immediate cash/card payment records cash_flow and ledger revenue. Legacy monedero input is normalized to asignado.';

grant execute on function public.sell_product(uuid, uuid, uuid, text, integer) to authenticated;
