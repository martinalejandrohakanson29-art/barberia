import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  serial,
  time,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const rolEnum = pgEnum("rol", ["cliente", "barbero", "admin"]);
export const nivelEnum = pgEnum("nivel", ["premium", "estandar"]);
export const estadoTurnoEnum = pgEnum("estado_turno", [
  "pendiente",
  "confirmado",
  "cancelado",
  "completado",
]);

// ─────────────────────────────────────────────────────────────
// Tablas de Better Auth (auth)
//   user / session / account / verification
//   A `user` le agregamos campos propios: phone y rol.
// ─────────────────────────────────────────────────────────────
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  // Campos propios
  phone: text("phone"),
  rol: rolEnum("rol").default("cliente").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

// ─────────────────────────────────────────────────────────────
// Tablas de dominio (agenda)
// ─────────────────────────────────────────────────────────────
export const barberos = pgTable("barberos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  nivel: nivelEnum("nivel").notNull(),
  activo: boolean("activo").default(true).notNull(),
  // Si el barbero también tiene login propio (para el panel), lo vinculamos.
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
});

// Cada servicio pertenece a un nivel (premium/estandar) y lleva su propia
// duración y precio, porque los menús difieren entre niveles.
export const servicios = pgTable("servicios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  nivel: nivelEnum("nivel").notNull(),
  duracionMin: integer("duracion_min").notNull(),
  // Precio en pesos (entero, sin decimales).
  precio: integer("precio").notNull(),
  activo: boolean("activo").default(true).notNull(),
});

// Horario laboral semanal por barbero. diaSemana: 0=domingo ... 6=sábado.
export const horarios = pgTable("horarios", {
  id: serial("id").primaryKey(),
  barberoId: integer("barbero_id")
    .notNull()
    .references(() => barberos.id, { onDelete: "cascade" }),
  diaSemana: integer("dia_semana").notNull(),
  horaInicio: time("hora_inicio").notNull(),
  horaFin: time("hora_fin").notNull(),
});

// Bloqueos puntuales (vacaciones, ausencias, descansos).
export const bloqueos = pgTable("bloqueos", {
  id: serial("id").primaryKey(),
  barberoId: integer("barbero_id")
    .notNull()
    .references(() => barberos.id, { onDelete: "cascade" }),
  desde: timestamp("desde", { withTimezone: true }).notNull(),
  hasta: timestamp("hasta", { withTimezone: true }).notNull(),
  motivo: text("motivo"),
});

export const turnos = pgTable("turnos", {
  id: serial("id").primaryKey(),
  // Reservas de invitado: clienteId queda null y se usan los campos clienteNombre/
  // Telefono/Email. Cuando se sume el login con Google, al reservar se completa
  // clienteId con el user de Better Auth (sin perder los datos de contacto).
  clienteId: text("cliente_id").references(() => user.id, {
    onDelete: "set null",
  }),
  clienteNombre: text("cliente_nombre"),
  clienteTelefono: text("cliente_telefono"),
  clienteEmail: text("cliente_email"),
  barberoId: integer("barbero_id")
    .notNull()
    .references(() => barberos.id, { onDelete: "restrict" }),
  servicioId: integer("servicio_id")
    .notNull()
    .references(() => servicios.id, { onDelete: "restrict" }),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fin: timestamp("fin", { withTimezone: true }).notNull(),
  // Las reservas públicas entran como "pendiente" hasta que un admin las confirma.
  estado: estadoTurnoEnum("estado").default("pendiente").notNull(),
  // Precio congelado al momento de reservar.
  precio: integer("precio").notNull(),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
});
