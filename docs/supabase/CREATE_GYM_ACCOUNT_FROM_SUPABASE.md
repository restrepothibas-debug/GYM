# Crear cuenta de gimnasio desde Supabase

Este flujo crea una cuenta nueva de gimnasio sin usar el formulario del
programa. El usuario dueno se crea primero en Supabase Auth y despues se crea
el tenant desde SQL Editor.

## Requisitos

- Estar en el proyecto Supabase correcto: `vuebqjashgcoexpihmko`.
- Tener aplicada la migracion:
  `20260609015559_prepare_manual_gym_account_creation.sql`.
- Crear primero el usuario en `Authentication > Users`.
- No pegar ni exponer tokens en SQL Editor, tickets, chats o commits.

## Paso 1: Crear usuario Auth

En Supabase Dashboard:

```text
Authentication > Users > Add user / Invite user
```

Usar el correo real del dueno del gimnasio. El alta del gimnasio no crea el
usuario Auth; solo lo busca por correo.

## Paso 2: Confirmar que el usuario existe

Ejecutar en SQL Editor:

```sql
select id, email, created_at, email_confirmed_at
from auth.users
where lower(email) = lower('dueno@gimnasio.com');
```

Debe devolver exactamente el usuario que se va a usar como dueno.

## Paso 3: Crear cuenta del gimnasio

Ejecutar:

```sql
select *
from app_private.create_gym_account_from_supabase(
  p_owner_email := 'dueno@gimnasio.com',
  p_gym_name := 'Nombre del Gimnasio',
  p_slug := 'nombre-del-gimnasio',
  p_license_type := 'annual',
  p_license_status := 'active',
  p_seats := 1
);
```

Valores permitidos:

- `p_license_type`: `annual`, `one_time`.
- `p_license_status`: `trial`, `active`, `expired`, `cancelled`.
- `p_slug`: letras minusculas, numeros y guiones. Debe tener de 3 a 64
  caracteres, sin espacios ni acentos.

La funcion crea:

- `public.tenants`.
- `public.tenant_memberships` con rol `owner`.
- `public.licenses`.
- Cuentas contables base.
- Planes de membresia base.

## Paso 4: Verificar alta

```sql
select
  t.id as tenant_id,
  t.name as gym_name,
  t.slug,
  t.status as tenant_status,
  u.email as owner_email,
  tm.role,
  tm.status as membership_status,
  l.license_type,
  l.status as license_status,
  l.seats,
  l.expires_on
from public.tenants t
join public.tenant_memberships tm on tm.tenant_id = t.id
join auth.users u on u.id = tm.user_id
join public.licenses l on l.tenant_id = t.id
where t.slug = 'nombre-del-gimnasio';
```

## Errores comunes

- `Auth user not found`: el correo no existe en `Authentication > Users`.
- `Tenant slug already exists`: ya existe un gimnasio con ese slug.
- `Slug must be...`: el slug tiene espacios, mayusculas, acentos o longitud
  invalida.
- `Invalid license type`: usar solo `annual` o `one_time`.

## Agregar otro usuario al mismo gimnasio

Crear primero el usuario en Supabase Auth y despues ejecutar:

```sql
insert into public.tenant_memberships (tenant_id, user_id, role, status)
select
  t.id,
  u.id,
  'staff',
  'active'
from public.tenants t
cross join auth.users u
where t.slug = 'nombre-del-gimnasio'
  and lower(u.email) = lower('usuario@gimnasio.com')
on conflict (tenant_id, user_id)
do update set
  role = excluded.role,
  status = 'active';
```

Roles validos: `owner`, `admin`, `staff`.
