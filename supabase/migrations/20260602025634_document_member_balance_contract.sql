comment on column public.members.balance is
  'Accounting balance for the member: negative = accounts receivable/debt, zero = paid, positive = customer credit. This is not a standalone wallet field.';

comment on function public.create_member(uuid, text, text, text, text, date, numeric, numeric) is
  'Creates a member and records enrollment accounting. p_initial_balance is a legacy parameter name meaning initial payment received, not wallet top-up. Member balance = initial payment - plan price.';

comment on function public.record_payment(uuid, uuid, numeric, text) is
  'Records a member payment. Payments first reduce accounts receivable; any excess becomes customer credit.';

comment on function public.sell_product(uuid, uuid, uuid, text, integer) is
  'Sells a product transactionally. payment_method monedero means charge to member accounting balance, not an enrollment wallet deposit.';
