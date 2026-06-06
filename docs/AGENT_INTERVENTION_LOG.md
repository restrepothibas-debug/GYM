# Agent Intervention Log

Este registro documenta intervenciones tecnicas que ya cambiaron estructura,
seguridad, UI o procesos del proyecto. Debe actualizarse en la misma rama cuando
un agente agregue migraciones, flujos operativos o controles que otros agentes
puedan romper por desconocimiento.

## 2026-06-06 - Configuracion operativa, contabilidad y pagos asignados

Motivo:

- Convertir los planes de membresia en configuracion por tenant, no constantes
  duplicadas en componentes.
- Exponer una vista contable basada en `ledger_entries` en vez de depender solo
  de `cash_flow`.
- Corregir la brecha operativa donde un pago de socio no podia aplicarse a
  productos comprados a credito sin tocar `members.balance`.

Archivos principales:

- `supabase/migrations/20260606135843_membership_plans_accounting_payments.sql`
- `src/context/GymContext.jsx`
- `src/components/GymIdentityModal.jsx`
- `src/components/AddMemberModal.jsx`
- `src/components/BottomSheet.jsx`
- `src/components/Members.jsx`
- `src/components/Accounting.jsx`
- `src/lib/membershipPlans.js`
- `src/lib/accountingReports.js`
- `src/styles/office-theme.css`
- `scripts/operational-qa.mjs`

Contrato:

- `membership_plans` es el catalogo de planes por tenant. Inscripcion y
  renovacion deben leer ese catalogo; no reintroducir presets hardcodeados en
  componentes.
- `member_membership_events` audita inscripciones, renovaciones y ajustes
  manuales de dias. Los cambios de vencimiento no deben ser silenciosos.
- `record_member_payment_allocated` es el RPC para pagos de socio. Con
  `p_target = products` actualiza `member_purchases.amount_paid` y
  `payment_status`; no debe mutar `members.balance` salvo exceso que quede como
  credito del socio.
- `record_payment` queda como wrapper de compatibilidad para deuda de membresia.
- La vista de Contabilidad consume `ledgerEntries` desde `GymContext`; no debe
  calcular ingresos formales solo desde `cash_flow`.
- Los estilos visuales nuevos permanecen centralizados en
  `src/styles/office-theme.css`.

Correccion posterior:

- `supabase/migrations/20260606165438_allow_dynamic_member_plan_catalog.sql`
  elimina el `members_plan_check` heredado que limitaba planes a
  `diario/semanal/mensual/trimestral/anual`.
- `members.plan` queda validado por formato y por FK compuesta
  `(tenant_id, plan)` hacia `membership_plans(tenant_id, plan_key)`.
- No reintroducir constraints tipo enum sobre `members.plan`; los planes validos
  son configuracion del tenant y los RPCs siguen exigiendo planes activos.

## 2026-06-06 - Cierre de auditoria biometrica

Motivo:

- El revisor detecto que `public.member_biometrics` tenia un `grant select`
  amplio para `authenticated`.
- Ese permiso exponia `template_encrypted` por Data API aunque la UI solo pidiera
  metadata.
- El revisor tambien reporto fallas de tests por componentes con `useUi()` sin
  `UiProvider`.

Cambios aplicados:

- `supabase/migrations/20260606000759_add_member_biometrics_standard.sql`
  revoca permisos amplios para `anon` y `authenticated`.
- La misma migracion reemplaza el permiso de tabla por permisos de columna:
  `select` excluye `template_encrypted`; `insert` y `update` lo conservan para
  enrolamiento y revocacion.
- `docs/BIOMETRIC_STANDARD.md` declara que `template_encrypted` es write-only
  para el rol autenticado de la Data API.

Decision de seguridad:

- RLS controla filas por tenant, pero no oculta columnas sensibles. Por eso la
  barrera de seguridad para el payload biometrico esta en permisos de columna.
- No reemplazar estos grants por `grant select, insert, update on table` en
  futuras migraciones.

Validacion:

- `npx vitest run` paso con 2 archivos y 8 pruebas.
- La falla de `UiProvider` no se reproduce en el estado actual porque
  `src/components/integration.test.jsx` envuelve los componentes con
  `UiProvider`.
- `npm run codex:mcp:fix` dejo Codex MCP apuntando a
  `vuebqjashgcoexpihmko` con `SUPABASE_ACCESS_TOKEN`.
- `npm run agent:preflight` confirmo acceso de Supabase API y GitHub.
- `supabase db push --yes` aplico en remoto:
  `20260605171801_add_gym_identity_fields.sql` y
  `20260606000759_add_member_biometrics_standard.sql`.
- `supabase migration list` confirmo ambas migraciones registradas en remoto.
- `has_column_privilege` en remoto confirmo:
  `authenticated_can_select_template = false`,
  `authenticated_can_insert_template = true` y
  `authenticated_can_update_template = true`.
- `information_schema.table_privileges` en remoto devolvio cero permisos de
  tabla para `authenticated` sobre `public.member_biometrics`.
- `pg_policies` en remoto confirmo las politicas
  `member_biometrics_select`, `member_biometrics_insert` y
  `member_biometrics_update` para el rol `authenticated`.
- `supabase db advisors --linked --type security` no reporto hallazgos nuevos
  sobre `member_biometrics`; solo reporto la configuracion global existente
  `auth_leaked_password_protection`.

## 2026-06-06 - Constraint de revocacion biometrica

Motivo:

- El revisor confirmo que el constraint remoto permitia `status = revoked` con
  `template_encrypted` retenido si `revoked_at` estaba presente.
- Eso contradecia el estandar del proyecto: revocar una huella debe limpiar el
  payload en la base de datos, no solo en la UI.

Cambios aplicados:

- `supabase/migrations/20260606000759_add_member_biometrics_standard.sql`
  quedo reforzada para instalaciones limpias.
- `supabase/migrations/20260606125116_enforce_biometric_revocation_payload_clear.sql`
  limpia filas revocadas que retengan payload, reemplaza
  `member_biometrics_revocation_state` y valida el constraint.
- El nuevo constraint exige:
  `status = active and revoked_at is null`, o
  `status = revoked and revoked_at is not null and template_encrypted is null`.

Validacion remota:

- `supabase db push --dry-run` mostro solo
  `20260606125116_enforce_biometric_revocation_payload_clear.sql`.
- `supabase db push --yes` aplico esa migracion en
  `vuebqjashgcoexpihmko`.
- `supabase migration list` confirmo `20260606125116` en local y remoto.
- `pg_get_constraintdef` confirmo que `member_biometrics_revocation_state`
  incluye `template_encrypted IS NULL` para `revoked`.
- Prueba negativa remota: un insert `revoked` con `template_encrypted` fue
  rechazado por `member_biometrics_revocation_state`.
- Prueba positiva remota: un insert `revoked` con `template_encrypted = null`
  paso dentro de una transaccion con `rollback`.
- Verificacion de limpieza: no quedaron filas QA con `finger_label` de prueba.
- `supabase db advisors --linked --type security` no reporto hallazgos nuevos
  sobre biometria; solo mantiene `auth_leaked_password_protection`.

## 2026-06-06 - Identidad del gimnasio

Motivo:

- Agregar configuracion editable de identidad del gimnasio sin crear una segunda
  fuente de verdad fuera del tenant.

Archivos principales:

- `supabase/migrations/20260605171801_add_gym_identity_fields.sql`
- `src/components/GymIdentityModal.jsx`
- `src/context/GymContext.jsx`
- `src/App.jsx`
- `src/styles/office-theme.css`

Contrato:

- Los campos de identidad viven en `public.tenants`.
- La identidad es metadata de presentacion/contacto. No controla slug, licencia,
  tenant activo, membresias, autorizacion ni estado contable.
- Si la migracion remota no esta aplicada, la app debe seguir iniciando con el
  select base de tenant y mostrar error localizado solo en el editor de
  identidad.

## 2026-06-06 - Estandar de huella digital

Motivo:

- Preparar soporte de lectores de huella sin acoplar React a SDKs de hardware.

Archivos principales:

- `docs/BIOMETRIC_STANDARD.md`
- `src/lib/biometrics/biometricTypes.js`
- `src/lib/biometrics/biometricRegistry.js`
- `src/lib/biometrics/adapters/mockAdapter.js`
- `src/lib/biometrics/adapters/secugenAdapter.js`
- `src/lib/biometrics/adapters/digitalPersonaAdapter.js`
- `src/lib/biometrics/adapters/zktecoAdapter.js`
- `src/lib/biometrics/adapters/supremaAdapter.js`
- `src/components/BiometricSettingsModal.jsx`
- `src/components/BiometricCheckinModal.jsx`
- `src/components/BottomSheet.jsx`
- `src/context/GymContext.jsx`
- `supabase/migrations/20260606000759_add_member_biometrics_standard.sql`

Contrato:

- Los componentes usan `GymContext`; no deben importar SDKs de proveedor.
- El adaptador `mock` es solo para UI, QA local y pruebas de flujo.
- No guardar imagenes de huella ni templates sin cifrar.
- Mantener entrada manual/documento/QR como alternativa operativa.
- Revocar una huella debe limpiar `template_encrypted` y dejar auditoria por
  estado/fecha.

## 2026-06-06 - Modales, avisos y proceso desktop

Motivo:

- Reemplazar `alert`/`confirm` nativos por UI profesional y preparar empaque de
  escritorio.

Archivos principales:

- `src/context/UiContext.jsx`
- `src/main.jsx`
- `src/components/Members.jsx`
- `src/components/Payments.jsx`
- `src/components/BottomSheet.jsx`
- `src/components/integration.test.jsx`
- `src/styles/design-tokens.css`
- `src/styles/office-theme.css`
- `docs/AGENT_PROCESS_STANDARDS.md`
- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/electron-dev.sh`
- `package.json`
- `vite.config.js`

Contrato:

- Todo componente que use `useUi()` debe estar dentro de `UiProvider`.
- Los tests que rendericen componentes con `useUi()` deben envolverlos con
  `UiProvider`.
- Los estilos visuales globales pertenecen a `src/styles/design-tokens.css` y
  `src/styles/office-theme.css`; no agregar CSS inline ni hojas locales
  paralelas para resolver conflictos visuales.
- Electron debe mantener `nodeIntegration: false`, `contextIsolation: true` y
  `sandbox: true`.
