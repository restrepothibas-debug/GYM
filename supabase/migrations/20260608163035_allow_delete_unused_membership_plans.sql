-- Allow tenant admins to delete unused membership plans.
-- ----------------------------------------------------
-- `members.plan` already references `membership_plans(tenant_id, plan_key)` with
-- `on delete restrict`, so plans assigned to active/historical members remain
-- protected and must be deactivated instead.

drop policy if exists membership_plans_delete on public.membership_plans;

create policy membership_plans_delete on public.membership_plans
  for delete to authenticated
  using (app_private.has_tenant_admin(tenant_id));

grant delete on public.membership_plans to authenticated;
