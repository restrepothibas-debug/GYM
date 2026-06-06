-- Enforce biometric revocation payload cleanup
-- --------------------------------------------
-- The UI clears `template_encrypted` when a fingerprint enrollment is revoked,
-- but the database must enforce the same rule for API clients, scripts and
-- future integrations. This migration first repairs any already-revoked rows
-- that still retain payload, then replaces the revocation constraint.

update public.member_biometrics
set
  template_encrypted = null,
  updated_at = now()
where status = 'revoked'
  and template_encrypted is not null;

alter table public.member_biometrics
  drop constraint if exists member_biometrics_revocation_state;

alter table public.member_biometrics
  add constraint member_biometrics_revocation_state
  check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and template_encrypted is null)
  )
  not valid;

alter table public.member_biometrics
  validate constraint member_biometrics_revocation_state;

comment on constraint member_biometrics_revocation_state on public.member_biometrics is
  'Revoked biometric enrollments must include revoked_at and must not retain template_encrypted.';
