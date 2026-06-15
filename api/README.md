# Arcanus API

Backend de reservas para Arcanus Barbería. Reemplaza a AgendaPro.

- **Stack:** Node + TypeScript, Fastify, Drizzle ORM, Postgres, Better Auth.
- **Auth:** email/contraseña + login con Google.

## Estado actual

- Esquema de base de datos (auth + agenda).
- Servidor Fastify con Better Auth montado en `/api/auth/*`.
- Endpoints de catálogo: `/api/servicios`, `/api/barberos`, `/health`.
- Seed con los barberos, servicios y horarios reales del local.
- **Motor de disponibilidad** (`/api/disponibilidad`) y **reserva pública** (`POST /api/turnos`, invitado).
- **Panel de administración** (`/api/admin/*`, requiere sesión admin/barbero): turnero,
  alta/edición de turnos, CRUD de barberos y servicios.

### Endpoints principales

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| GET  | `/api/disponibilidad?barberoId&servicioId&fecha` | público | Horarios libres |
| POST | `/api/turnos` | público | Reserva de invitado (queda `pendiente`) |
| GET  | `/api/admin/me` | admin | Sesión actual |
| GET  | `/api/admin/turnos?desde&hasta` | admin | Turnos del rango |
| POST | `/api/admin/turnos` | admin | Alta manual |
| PATCH| `/api/admin/turnos/:id` | admin | Estado / mover / reasignar |
| DELETE | `/api/admin/turnos/:id` | admin | Eliminar |
| GET/POST/PATCH/DELETE | `/api/admin/barberos[/:id]` | admin | Profesionales |
| GET/POST/PATCH/DELETE | `/api/admin/servicios[/:id]` | admin | Servicios |

> El login con Google queda **preparado** (en `turnos`, `clienteId` es nullable y se
> completa con el user de Better Auth cuando se active). Hoy las reservas son de invitado.

### Usuario admin

```bash
npm run seed:admin     # crea ADMIN_EMAIL / ADMIN_PASSWORD (def: admin@arcanus.com / arcanus123)
```

> Variables opcionales: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`. **Cambiar la
> contraseña en producción.**

### Esquema de base de datos

> Esta base se administra con **`db:push`** (sincroniza el esquema directo), no con el
> runner de migraciones. Al cambiar `schema.ts`, aplicar con `npm run db:push`. Los
> archivos de `drizzle/` quedan como historial pero `db:migrate` no es el flujo de esta base.

---

## Puesta en marcha (local)

1. Copiar el archivo de entorno y completarlo:

   ```bash
   cp .env.example .env
   ```

   Completar como mínimo `DATABASE_URL` y `BETTER_AUTH_SECRET`
   (generar el secreto con `openssl rand -base64 32`).

2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Crear las tablas en la base:

   ```bash
   npm run db:push      # aplica el esquema directo (ideal para desarrollo)
   # o, con migraciones versionadas:
   # npm run db:generate && npm run db:migrate
   ```

4. Cargar datos iniciales (barberos, servicios, horarios):

   ```bash
   npm run seed
   ```

5. Levantar la API:

   ```bash
   npm run dev          # http://localhost:3000
   ```

6. Probar:

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/api/servicios
   ```

---

## Login con Google

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   crear un proyecto y unas credenciales **OAuth client ID** tipo *Web application*.
2. En **Authorized redirect URIs** agregar:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Producción: `https://TU-API.up.railway.app/api/auth/callback/google`
3. Copiar el *Client ID* y *Client secret* a `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET` en `.env` (o en las variables de Railway).
4. Reiniciar la API. Si las dos variables están presentes, el proveedor Google
   se activa solo (ver `src/auth.ts`).

El frontend inicia el flujo redirigiendo a:
`GET /api/auth/sign-in/social?provider=google`

---

## Deploy en Railway

Crear un nuevo servicio en el mismo proyecto donde está el Postgres:

- **Root directory:** `api`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm run db:push -- --force && npm run start`
  (esta base se sincroniza con `db:push`, no con `db:migrate`).
- **Variables:**
  - `DATABASE_URL` → referenciar el Postgres: `${{Postgres.DATABASE_URL}}`
  - `BETTER_AUTH_SECRET` → secreto aleatorio
  - `BETTER_AUTH_URL` → la URL pública del servicio (ej. `https://arcanus-api.up.railway.app`)
  - `CLIENT_ORIGIN` → la URL del sitio estático
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

El seed se corre una sola vez de forma manual:
`railway run npm run seed` (o desde la consola del servicio).

---

## Estructura

```
api/
├── src/
│   ├── index.ts        # servidor Fastify + rutas
│   ├── auth.ts         # configuración de Better Auth
│   ├── seed.ts         # datos iniciales
│   └── db/
│       ├── index.ts    # cliente Drizzle
│       └── schema.ts   # tablas (auth + agenda)
├── drizzle/            # migraciones generadas
└── drizzle.config.ts
```

## Modelo de datos

- `user`, `session`, `account`, `verification` — Better Auth (`user` lleva `phone` y `rol`).
- `barberos` — nombre, nivel (premium/estandar).
- `servicios` — nombre, nivel, duración, precio (los menús difieren por nivel).
- `horarios` — horario laboral semanal por barbero.
- `bloqueos` — ausencias/vacaciones.
- `turnos` — reservas (cliente, barbero, servicio, inicio/fin, estado, precio).
