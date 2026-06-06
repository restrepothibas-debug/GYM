-- Gym identity extension
-- ----------------------
-- The application already models each gym as a tenant. Keep brand/contact data
-- on public.tenants so RLS, tenant switching and the activeTenant header keep a
-- single source of truth. Do not create a parallel "gym_settings" table unless
-- identity becomes multi-record or versioned.
alter table public.tenants
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists logo_url text,
  add column if not exists brand_color text,
  add column if not exists receipt_footer text;

-- Brand color is optional, but when set it must be a full hex color. The
-- frontend treats this as a display token only; it must never drive access,
-- tenant selection or any security-sensitive behavior.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenants_brand_color_hex'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_brand_color_hex
      check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

comment on column public.tenants.legal_name is
  'Optional legal or billing name for receipts and formal documents.';
comment on column public.tenants.tax_id is
  'Optional business tax identifier. Store display value only; do not use as tenant key.';
comment on column public.tenants.phone is
  'Optional public contact phone for the gym identity/profile.';
comment on column public.tenants.email is
  'Optional public contact email for the gym identity/profile.';
comment on column public.tenants.address is
  'Optional public address shown in operational documents and receipts.';
comment on column public.tenants.city is
  'Optional city/location label for the gym identity/profile.';
comment on column public.tenants.logo_url is
  'Optional logo URL. Upload/storage policy is intentionally separate from tenant RLS.';
comment on column public.tenants.brand_color is
  'Optional full hex color used only for presentation, not authorization.';
comment on column public.tenants.receipt_footer is
  'Optional receipt footer text. Keep short and non-sensitive.';
