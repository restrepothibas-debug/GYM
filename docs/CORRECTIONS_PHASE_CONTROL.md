# Plan de Correcciones UI y Lógica Contable

Este documento detalla las fases para corregir la navegación, la gestión de sesiones y la integridad de los saldos de atletas.

## Fase 1: Corrección de Navegación y Sesión
**Objetivo:** Mover el botón de cierre de sesión al final del menú lateral y asegurar que funcione en todos los modos (local/remoto).

- [ ] Modificar `src/App.jsx` para inyectar un ítem especial de "Cerrar Sesión" al final del array `MAIN_NAV_ITEMS` o manejarlo directamente en el render de la barra de navegación.
- [ ] Verificar la implementación de `signOut` en `src/context/GymContext.jsx`. Se ha detectado que `supabase.auth.signOut()` podría no estar limpiando el estado local si falla la llamada de red.
- [ ] Asegurar que `signOut` ejecute `resetRemoteState()` explícitamente para limpiar la UI inmediatamente.

## Fase 2: Auditoría de Saldos y Planes
**Objetivo:** Eliminar valores predeterminados incorrectos ($45,000) y corregir la lógica de expiración de planes.

- [ ] Investigar en `supabase/migrations/` y `GymContext.jsx` el origen del valor $45,000. Sospecha: Valor por defecto en la función RPC `create_member` o en los datos de semilla (`seedData.js`).
- [ ] Validar la lógica de `addMember` y `renewMemberPlan`. El saldo debe ser estrictamente `pago_recibido - precio_plan`.
- [ ] Revisar `getDaysRemaining` en `src/lib/dateUtils.js`. Asegurar que los planes diarios (1 día) cuenten correctamente el día actual.

## Fase 3: Validación y Despliegue
**Objetivo:** Verificar que no existan regresiones contables.

- [ ] Ejecutar `npm run qa:operational` para confirmar que los saldos calculados por el backend coinciden con las expectativas de la UI.
- [ ] Realizar pruebas manuales de inscripción con diferentes planes (Diario, Semanal, Mensual).
- [ ] Sincronizar con GitHub y monitorear el despliegue automático en Vercel.

---
*Archivo de control creado el 12 de Junio de 2026.*
