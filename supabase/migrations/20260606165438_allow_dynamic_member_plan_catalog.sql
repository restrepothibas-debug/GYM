-- Allow tenant-scoped dynamic membership plans on members.plan
-- ----------------------------------------------------------
-- `membership_plans` is now the source of truth. The legacy CHECK constraint
-- still limited members.plan to the five original presets, so custom plans
-- created from the configuration UI could not be assigned during enrollment or
-- renewal. Keep database validation tenant-aware with a composite FK instead
-- of returning to a hardcoded enum list.

do $$
declare
  v_tenant_id uuid;
begin
  for v_tenant_id in select id from public.tenants loop
    perform app_private.ensure_default_membership_plans(v_tenant_id);
  end loop;
end;
$$;

alter table public.members
  drop constraint if exists members_plan_check;

alter table public.members
  add constraint members_plan_key_format_check
  check (plan ~ '^[a-z0-9_][a-z0-9_-]{0,62}$');

alter table public.members
  add constraint members_plan_catalog_fk
  foreign key (tenant_id, plan)
  references public.membership_plans (tenant_id, plan_key)
  on update restrict
  on delete restrict
  not valid;

alter table public.members
  validate constraint members_plan_catalog_fk;

comment on constraint members_plan_key_format_check on public.members is
  'Plan keys must use the same normalized format as membership_plans.plan_key.';

comment on constraint members_plan_catalog_fk on public.members is
  'members.plan must exist in the tenant-scoped membership_plans catalog. Active/inactive business rules remain enforced by create_member and renew_member_plan.';
