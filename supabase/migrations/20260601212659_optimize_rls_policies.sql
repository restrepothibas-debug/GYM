drop policy if exists tenants_select on public.tenants;
drop policy if exists tenants_insert on public.tenants;
drop policy if exists memberships_select on public.tenant_memberships;
drop policy if exists memberships_insert on public.tenant_memberships;

create policy tenants_select on public.tenants
  for select to authenticated
  using (created_by = (select auth.uid()) or app_private.has_tenant_access(id));

create policy tenants_insert on public.tenants
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy memberships_select on public.tenant_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or app_private.has_tenant_admin(tenant_id));

create policy memberships_insert on public.tenant_memberships
  for insert to authenticated
  with check (
    app_private.has_tenant_admin(tenant_id)
    or (
      user_id = (select auth.uid())
      and role = 'owner'
      and exists (
        select 1 from public.tenants t
        where t.id = tenant_id
          and t.created_by = (select auth.uid())
      )
    )
  );

drop policy if exists licenses_write_admin on public.licenses;
drop policy if exists members_write on public.members;
drop policy if exists products_write on public.products;
drop policy if exists attendance_write on public.attendance_log;
drop policy if exists purchases_write on public.member_purchases;
drop policy if exists cash_flow_write on public.cash_flow;

create policy licenses_insert_admin on public.licenses
  for insert to authenticated
  with check (app_private.has_tenant_admin(tenant_id));

create policy licenses_update_admin on public.licenses
  for update to authenticated
  using (app_private.has_tenant_admin(tenant_id))
  with check (app_private.has_tenant_admin(tenant_id));

create policy licenses_delete_admin on public.licenses
  for delete to authenticated
  using (app_private.has_tenant_admin(tenant_id));

create policy members_insert on public.members
  for insert to authenticated
  with check (app_private.has_tenant_access(tenant_id));

create policy members_update on public.members
  for update to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

create policy members_delete on public.members
  for delete to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy products_insert on public.products
  for insert to authenticated
  with check (app_private.has_tenant_access(tenant_id));

create policy products_update on public.products
  for update to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

create policy products_delete on public.products
  for delete to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy attendance_insert on public.attendance_log
  for insert to authenticated
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = attendance_log.tenant_id
    )
  );

create policy attendance_update on public.attendance_log
  for update to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = attendance_log.tenant_id
    )
  );

create policy attendance_delete on public.attendance_log
  for delete to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy purchases_insert on public.member_purchases
  for insert to authenticated
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = member_purchases.tenant_id
    )
  );

create policy purchases_update on public.member_purchases
  for update to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (
    app_private.has_tenant_access(tenant_id)
    and exists (
      select 1 from public.members m
      where m.id = member_id
        and m.tenant_id = member_purchases.tenant_id
    )
  );

create policy purchases_delete on public.member_purchases
  for delete to authenticated
  using (app_private.has_tenant_access(tenant_id));

create policy cash_flow_insert on public.cash_flow
  for insert to authenticated
  with check (app_private.has_tenant_access(tenant_id));

create policy cash_flow_update on public.cash_flow
  for update to authenticated
  using (app_private.has_tenant_access(tenant_id))
  with check (app_private.has_tenant_access(tenant_id));

create policy cash_flow_delete on public.cash_flow
  for delete to authenticated
  using (app_private.has_tenant_access(tenant_id));
