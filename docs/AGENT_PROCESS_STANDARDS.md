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
