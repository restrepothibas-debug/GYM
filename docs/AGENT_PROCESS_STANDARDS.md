# Agent Process Standards

Este archivo es la fuente de verdad para flujos repetibles del proyecto. Si un agente encuentra un error operativo, un paso manual repetido o una decision que debe quedar estandarizada, debe agregarla aqui en el mismo cambio.

## Principios

- Ejecutar `npm run agent:preflight` antes de trabajos de infraestructura, base de datos, deploy, GitHub o seguridad.
- No imprimir secretos. `.env.local` es local y nunca se commitea.
- No asumir que la identidad global del equipo, Git, GitHub CLI o el navegador es la correcta.
- Verificar estado antes y despues de cada proceso con comandos concretos.
- Documentar el flujo aqui cuando algo se automatice o cuando un error sea facil de repetir.

## Flujo: Subir cambios a GitHub

Problema que ya ocurrio:

- El remoto correcto era `https://github.com/restrepothibas-debug/GYM.git`.
- El primer `git push` uso credenciales cacheadas de la cuenta `epieyu1`.
- GitHub rechazo el push con `403` porque esa cuenta no tenia permiso de escritura.
- El token correcto estaba en `.env.local` como `GH_TOKEN`/`GITHUB_TOKEN` y pertenecia a `restrepothibas-debug`.

Regla:

Nunca hacer push a GitHub sin verificar que la credencial activa corresponde al propietario o colaborador correcto del repositorio.

Pasos estandar:

1. Revisar estado local.

```bash
git status --short --branch
git remote -v
git log -1 --oneline --decorate
```

2. Cargar variables locales y validar GitHub CLI sin imprimir tokens.

```bash
set -a
source .env.local
set +a
gh auth status
```

El resultado esperado para este repositorio debe mostrar la cuenta `restrepothibas-debug` con `GH_TOKEN` o un metodo equivalente con permiso `repo`.

3. Si `git push` intenta usar una cuenta equivocada o devuelve `403`, no cambiar el remoto para incluir tokens. Usar un credential helper temporal con `GH_TOKEN`.

```bash
zsh -lc '
set -a
source .env.local >/dev/null 2>&1
set +a
GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c '\''credential.helper=!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'\'' push -u origin main
'
```

4. Confirmar que el push quedo publicado.

```bash
git status --short --branch
git log -1 --oneline --decorate
```

Estado esperado:

```text
## main...origin/main
```

No debe quedar `[ahead N]`, `[behind N]` ni cambios pendientes no explicados.

## Flujo: Conectar Supabase MCP en Codex

Problema que ya ocurrio:

- `codex mcp login supabase` abre un flujo OAuth en navegador.
- El navegador puede estar autenticado con una cuenta diferente a la que se usa en este proyecto.
- Eso puede conectar Codex al tenant/cuenta equivocado aunque el project ref sea correcto.
- El usuario tiene dos cuentas de Supabase. Una conexion MCP global puede ser valida para otra cuenta, pero incorrecta para este repo.
- Este repo espera exclusivamente el proyecto `vuebqjashgcoexpihmko`.

Regla:

Para este proyecto no usar OAuth/browser como primer camino ni confiar en un MCP global existente. Supabase MCP debe configurarse desde este repo con `SUPABASE_ACCESS_TOKEN` de `.env.local`, y ese token debe tener acceso a `vuebqjashgcoexpihmko`.

Pasos estandar:

1. Confirmar que `.env.local` tiene el token y el project ref sin imprimir secretos.

```bash
set -a
source .env.local >/dev/null 2>&1
set +a
test -n "$SUPABASE_ACCESS_TOKEN" && echo "SUPABASE_ACCESS_TOKEN=set"
echo "SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF"
```

El project ref esperado es:

```text
vuebqjashgcoexpihmko
```

2. Configurar Codex MCP con el fix del proyecto.

```bash
npm run codex:mcp:fix
```

Si este comando falla con `SUPABASE_ACCESS_TOKEN cannot access vuebqjashgcoexpihmko`, reemplazar `SUPABASE_ACCESS_TOKEN` en `.env.local` por un token de la cuenta correcta antes de continuar.

3. Verificar que Codex no quedo en OAuth ni en el proyecto equivocado.

```bash
codex mcp list
codex mcp get supabase
```

Estado esperado:

```text
Bearer Token Env Var: SUPABASE_ACCESS_TOKEN
Auth: Bearer token
```

La URL debe contener:

```text
project_ref=vuebqjashgcoexpihmko
```

4. Iniciar Codex desde el repo con `.env.local` cargado.

```bash
cd /Users/alexanderrestrepoepieyu/Desktop/gym
set -a
source .env.local
set +a
codex
```

5. Dentro de Codex, ejecutar `/mcp` y verificar que `supabase` aparece activo con `vuebqjashgcoexpihmko`.

No ejecutar `codex mcp login supabase` salvo que el usuario pida explicitamente usar OAuth y confirme la cuenta correcta en el navegador.

## Flujo: Preparar un commit

Pasos estandar:

1. Revisar cambios.

```bash
git status --short --branch
git diff --stat
git diff
```

2. Validar que no entren archivos locales o sensibles.

```bash
git status --short --ignored
git check-ignore -v .env.local node_modules dist .agents skills-lock.json supabase/.temp/project-ref
```

3. Escanear patrones obvios de secretos antes de commitear.

```bash
secret_pattern='(service_''role|SUPABASE_SERVICE_''ROLE|g''hp_|github_''pat_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|s''bp_[A-Za-z0-9_\\-]{20,}|v''ca_[A-Za-z0-9_\\-]{20,}|BEGIN (RSA|OPENSSH|DSA|EC|PRIVATE) KEY)'
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**' --glob '!.agents/**' --glob '!skills-lock.json' --glob '!supabase/.temp/**' "$secret_pattern" .
```

4. Ejecutar verificaciones relevantes.

```bash
npm run lint
npm run build
```

5. Crear un commit con mensaje claro.

```bash
git add <archivos>
git commit -m "tipo: descripcion"
```

## Flujo: Archivos locales que no deben subirse

Estos archivos o carpetas deben permanecer ignorados salvo una razon explicita:

- `.env.local`
- `node_modules/`
- `dist/`
- `.agents/`
- `skills-lock.json`
- `supabase/.temp/`
- `.DS_Store`

La migracion SQL y `supabase/config.toml` si pueden versionarse. El estado temporal de la CLI de Supabase no.

## Flujo: QA operativo y contable

Problema que evita:

- Probar solo la UI o solo SQL sin confirmar que Auth, RLS, RPC y contabilidad funcionan juntos.
- Registrar movimientos de caja sin asientos contables balanceados.

Regla:

Despues de cambios en Auth, tenant isolation, RPC operativas o contabilidad, ejecutar el QA operativo con el usuario de prueba documentado.

Pasos estandar:

1. Cargar variables locales.

```bash
set -a
source .env.local
set +a
```

2. Ejecutar el script.

```bash
node scripts/operational-qa.mjs
```

3. Confirmar que cada resultado tenga `"ok": true`.

Verificacion final:

- `accounting.cash_matches_cash_flow` debe ser `true`.
- `accounting.run_trial_balance` debe ser `true`.
- Si Auth devuelve `Email not confirmed` para el usuario de prueba, confirmar solo ese usuario antes de repetir.

## Flujo: Auth y carga de cuenta

Problema que evita:

- Que el programa quede indefinidamente en "Preparando cuenta" despues de ingresar credenciales correctas.
- Mostrar el formulario de crear gimnasio cuando en realidad fallo la carga de tenant, licencia o RLS.

Regla:

Despues de credenciales validas, la app debe terminar en uno de tres estados: app abierta con tenant activo, formulario de tenant solo si la carga fue exitosa y no hay tenant, o error recuperable con reintento/cierre de sesion.

Pasos estandar:

1. Revisar `docs/process-control/AUTH_WORKSPACE_LOADING.md`.
2. Revisar `src/context/GymContext.jsx` antes de cambiar Auth, RLS, tenants o licencias.
3. Mantener las llamadas remotas de Auth/workspace con timeout y con estado separado `workspaceLoaded`.
4. Ejecutar:

```bash
npm run lint
npm run build
npm run qa:operational
```

Verificacion final:

- Login con `manolo@gmail.com` no debe quedarse en carga indefinida.
- Si falla Supabase/Auth/RLS, la pantalla debe mostrar error y controles de recuperacion.

## Flujo: Cambios en inscripción, saldo y pagos

Problema que evita:

- Confundir el pago inicial de un plan con una recarga de monedero.
- Romper la formula de saldo contable del socio.
- Volver a usar productos a credito como descuento del saldo de membresia del socio.
- Borrar fisicamente socios y perder historial operativo/contable.
- Cambiar etiquetas de UI sin respetar el contrato contable.

Regla:

Todo cambio en inscripción de socios, pagos, renovaciones, productos a credito o visualización de saldos debe preservar el contrato:

```text
members.balance = pago inicial recibido - precio del plan
```

Semantica obligatoria:

- Saldo negativo: deuda/cuenta por cobrar.
- Saldo cero: pagado al dia.
- Saldo positivo: credito a favor del socio.
- En inscripción, no llamar "monedero" al pago inicial recibido.
- Productos a credito o pagados nunca deben descontar `members.balance`; deben registrarse en `member_purchases`, stock, caja y ledger cuando aplique.
- La deuda total debe calcularse con `src/lib/accounting.js`: deuda de membresia mas productos a credito pendientes.
- Eliminar un usuario/socio debe ser desactivacion logica (`members.status = inactive`), no `DELETE`, para preservar historial.

Pasos estandar:

1. Revisar `docs/process-control/ACCOUNTING_STANDARD.md` y `docs/process-control/ACCOUNTING_MODEL.md`.
2. Revisar comentarios de contrato en `src/components/AddMemberModal.jsx` y `src/context/GymContext.jsx`.
3. Si se toca SQL/RPC, agregar o actualizar comentarios `COMMENT ON` cuando el contrato cambie.
4. Ejecutar:

```bash
npm run qa:operational
npm run lint
npm run build
```

Verificacion final:

- El caso `p_plan_price = 20000` y `p_initial_balance = 20000` debe dejar `members.balance = 0`.
- El credito de producto debe bajar stock, crear cuenta por cobrar y dejar `members.balance` sin cambios.
- La eliminacion de usuario debe ocultarlo de activos y conservar compras/asistencias.
- Cada asiento contable debe quedar balanceado.

## Flujo: Control del sistema visual

Problema que evita:

- Dejar colores, radios, sombras y reglas visuales repartidos entre componentes.

Regla:

Los cambios de apariencia global deben vivir en `src/styles/`. Los componentes deben priorizar layout, estado e interaccion.

Pasos estandar:

1. Revisar `docs/process-control/DESIGN_SYSTEM.md`.
2. Cambiar tokens en `src/styles/design-tokens.css`.
3. Cambiar mapeos de tema en `src/styles/office-theme.css`.
4. Ejecutar:

```bash
npm run lint
npm run build
```

## Plantilla para nuevos flujos

Cuando se agregue un flujo nuevo, usar este formato:

```markdown
## Flujo: Nombre del proceso

Problema que evita:

- ...

Regla:

...

Pasos estandar:

1. ...

Verificacion final:

...
```
