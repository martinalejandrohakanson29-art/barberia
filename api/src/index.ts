import "dotenv/config";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import {
  barberos,
  bloqueos,
  horarios,
  servicios,
  turnos,
} from "./db/schema.js";

// bodyLimit alto: las fotos de profesionales viajan como data URL en el JSON.
const app = Fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 });

const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:8080";

await app.register(cors, {
  origin: [clientOrigin],
  credentials: true,
});

// ─────────────────────────────────────────────────────────────
// Utilidades de fecha/hora (zona horaria Argentina, UTC-3)
//   Los turnos se guardan como timestamptz construidos con offset
//   explícito -03:00 para que la grilla del local sea consistente
//   sin importar la zona del servidor (Railway corre en UTC).
// ─────────────────────────────────────────────────────────────
const AR_OFFSET = "-03:00";
const AR_TZ = "America/Argentina/Cordoba";

const mkDate = (fecha: string, hhmm: string) =>
  new Date(`${fecha}T${hhmm}:00${AR_OFFSET}`);

const toMin = (t: string) => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(
    2,
    "0"
  )}`;

// Día de la semana (0=domingo) de una fecha calendario YYYY-MM-DD.
const weekday = (fecha: string) => {
  const [y, mo, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
};

// Convierte un instante a {fecha, hora} en horario de Argentina.
const fmtAR = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hora = `${get("hour")}:${get("minute")}`;
  if (hora.startsWith("24")) hora = `00${hora.slice(2)}`; // Intl puede dar 24:00
  return { fecha: `${get("year")}-${get("month")}-${get("day")}`, hora };
};

// Dos intervalos [aIni,aFin) y [bIni,bFin) se solapan.
const solapan = (aIni: Date, aFin: Date, bIni: Date, bFin: Date) =>
  aIni < bFin && bIni < aFin;

// ─────────────────────────────────────────────────────────────
// Better Auth: delega todo /api/auth/* al handler de la librería.
// ─────────────────────────────────────────────────────────────
const toWebHeaders = (request: FastifyRequest) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value) headers.append(key, Array.isArray(value) ? value.join(",") : value);
  }
  return headers;
};

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const req = new Request(url, {
      method: request.method,
      headers: toWebHeaders(request),
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : JSON.stringify(request.body),
    });

    const res = await auth.handler(req);
    reply.status(res.status);
    res.headers.forEach((value, key) => reply.header(key, value));
    reply.send(res.body ? await res.text() : null);
  },
});

// ─────────────────────────────────────────────────────────────
// Guard de administración: sólo admin/barbero acceden al panel.
// ─────────────────────────────────────────────────────────────
type SesionUsuario = { id: string; name: string; email: string; rol: string };

async function getUsuario(request: FastifyRequest): Promise<SesionUsuario | null> {
  const sesion = await auth.api.getSession({ headers: toWebHeaders(request) });
  if (!sesion?.user) return null;
  return sesion.user as unknown as SesionUsuario;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const usuario = await getUsuario(request);
  if (!usuario || !["admin", "barbero"].includes(usuario.rol)) {
    reply.status(401).send({ error: "No autorizado" });
    return;
  }
  (request as FastifyRequest & { usuario: SesionUsuario }).usuario = usuario;
}

// ─────────────────────────────────────────────────────────────
// Endpoints públicos de catálogo
// ─────────────────────────────────────────────────────────────
app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

app.get("/api/servicios", async () =>
  db.select().from(servicios).where(eq(servicios.activo, true))
);

app.get("/api/barberos", async () =>
  db.select().from(barberos).where(eq(barberos.activo, true))
);

// ─────────────────────────────────────────────────────────────
// Motor de disponibilidad
//   GET /api/disponibilidad?barberoId=&servicioId=&fecha=YYYY-MM-DD
//   Devuelve las horas de inicio libres ["10:00","10:30",...].
// ─────────────────────────────────────────────────────────────
const PASO_MIN = 15; // granularidad de los horarios ofrecidos

app.get("/api/disponibilidad", async (request, reply) => {
  const { barberoId, servicioId, fecha } = request.query as Record<
    string,
    string
  >;
  if (!barberoId || !servicioId || !fecha) {
    return reply.status(400).send({ error: "Faltan parámetros" });
  }

  const [servicio] = await db
    .select()
    .from(servicios)
    .where(eq(servicios.id, Number(servicioId)));
  if (!servicio) return reply.status(404).send({ error: "Servicio inexistente" });

  const dur = servicio.duracionMin;
  const wd = weekday(fecha);

  const ventanas = await db
    .select()
    .from(horarios)
    .where(
      and(
        eq(horarios.barberoId, Number(barberoId)),
        eq(horarios.diaSemana, wd)
      )
    );
  if (ventanas.length === 0) return [];

  const dayStart = mkDate(fecha, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const turnosDia = await db
    .select()
    .from(turnos)
    .where(
      and(
        eq(turnos.barberoId, Number(barberoId)),
        ne(turnos.estado, "cancelado"),
        gte(turnos.inicio, dayStart),
        lt(turnos.inicio, dayEnd)
      )
    );

  const bloqueosDia = await db
    .select()
    .from(bloqueos)
    .where(
      and(
        eq(bloqueos.barberoId, Number(barberoId)),
        lt(bloqueos.desde, dayEnd),
        gte(bloqueos.hasta, dayStart)
      )
    );

  const ahora = new Date();
  const libres: string[] = [];

  for (const v of ventanas) {
    const ini = toMin(v.horaInicio.slice(0, 5));
    const fin = toMin(v.horaFin.slice(0, 5));
    for (let s = ini; s + dur <= fin; s += PASO_MIN) {
      const sDate = mkDate(fecha, toHHMM(s));
      const eDate = new Date(sDate.getTime() + dur * 60000);
      if (sDate <= ahora) continue;

      const choca =
        turnosDia.some((t) => solapan(sDate, eDate, t.inicio, t.fin)) ||
        bloqueosDia.some((b) => solapan(sDate, eDate, b.desde, b.hasta));

      if (!choca) libres.push(toHHMM(s));
    }
  }

  return [...new Set(libres)].sort();
});

// ─────────────────────────────────────────────────────────────
// Reserva pública (invitado)
//   POST /api/turnos
//   body: { barberoId, servicioId, fecha, hora, nombre, telefono, email }
// ─────────────────────────────────────────────────────────────
app.post("/api/turnos", async (request, reply) => {
  const { barberoId, servicioId, fecha, hora, nombre, telefono, email } =
    (request.body ?? {}) as Record<string, string>;

  if (!barberoId || !servicioId || !fecha || !hora || !nombre || !telefono) {
    return reply.status(400).send({ error: "Faltan datos de la reserva" });
  }

  const [barbero] = await db
    .select()
    .from(barberos)
    .where(eq(barberos.id, Number(barberoId)));
  if (!barbero || !barbero.activo) {
    return reply.status(404).send({ error: "Barbero no disponible" });
  }

  const [servicio] = await db
    .select()
    .from(servicios)
    .where(eq(servicios.id, Number(servicioId)));
  if (!servicio || !servicio.activo) {
    return reply.status(404).send({ error: "Servicio no disponible" });
  }

  const inicio = mkDate(fecha, hora);
  const fin = new Date(inicio.getTime() + servicio.duracionMin * 60000);
  if (Number.isNaN(inicio.getTime())) {
    return reply.status(400).send({ error: "Fecha u hora inválida" });
  }
  if (inicio <= new Date()) {
    return reply.status(400).send({ error: "El horario ya pasó" });
  }

  // Revalidación anti-doble-reserva: el slot debe seguir libre.
  const dayStart = mkDate(fecha, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const ocupados = await db
    .select()
    .from(turnos)
    .where(
      and(
        eq(turnos.barberoId, Number(barberoId)),
        ne(turnos.estado, "cancelado"),
        gte(turnos.inicio, dayStart),
        lt(turnos.inicio, dayEnd)
      )
    );
  if (ocupados.some((t) => solapan(inicio, fin, t.inicio, t.fin))) {
    return reply
      .status(409)
      .send({ error: "Ese horario se acaba de ocupar, elegí otro" });
  }

  const [creado] = await db
    .insert(turnos)
    .values({
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim(),
      clienteEmail: email?.trim() || null,
      barberoId: Number(barberoId),
      servicioId: Number(servicioId),
      inicio,
      fin,
      estado: "pendiente",
      precio: servicio.precio,
    })
    .returning();

  return reply.status(201).send({
    ok: true,
    turno: {
      id: creado.id,
      barbero: barbero.nombre,
      servicio: servicio.nombre,
      ...fmtAR(inicio),
      precio: servicio.precio,
      estado: creado.estado,
    },
  });
});

// ═════════════════════════════════════════════════════════════
// PANEL DE ADMINISTRACIÓN (requiere sesión admin/barbero)
// ═════════════════════════════════════════════════════════════

app.get(
  "/api/admin/me",
  { preHandler: requireAdmin },
  async (request) =>
    (request as FastifyRequest & { usuario: SesionUsuario }).usuario
);

// Lista de turnos en un rango de fechas (para la grilla del turnero).
app.get(
  "/api/admin/turnos",
  { preHandler: requireAdmin },
  async (request) => {
    const { desde, hasta, estado, barberoId } = request.query as Record<
      string,
      string
    >;
    const ini = desde ? mkDate(desde, "00:00") : mkDate(fmtAR(new Date()).fecha, "00:00");
    const finRango = hasta
      ? new Date(mkDate(hasta, "00:00").getTime() + 24 * 60 * 60 * 1000)
      : new Date(ini.getTime() + 7 * 24 * 60 * 60 * 1000);

    const condiciones = [gte(turnos.inicio, ini), lt(turnos.inicio, finRango)];
    if (estado) condiciones.push(eq(turnos.estado, estado as typeof turnos.$inferSelect.estado));
    if (barberoId) condiciones.push(eq(turnos.barberoId, Number(barberoId)));

    const filas = await db
      .select({
        id: turnos.id,
        inicio: turnos.inicio,
        fin: turnos.fin,
        estado: turnos.estado,
        precio: turnos.precio,
        notas: turnos.notas,
        clienteNombre: turnos.clienteNombre,
        clienteTelefono: turnos.clienteTelefono,
        clienteEmail: turnos.clienteEmail,
        barberoId: turnos.barberoId,
        barberoNombre: barberos.nombre,
        servicioId: turnos.servicioId,
        servicioNombre: servicios.nombre,
        duracionMin: servicios.duracionMin,
      })
      .from(turnos)
      .leftJoin(barberos, eq(turnos.barberoId, barberos.id))
      .leftJoin(servicios, eq(turnos.servicioId, servicios.id))
      .where(and(...condiciones))
      .orderBy(asc(turnos.inicio));

    return filas.map((t) => ({
      ...t,
      ...fmtAR(t.inicio),
      duracion: Math.round((t.fin.getTime() - t.inicio.getTime()) / 60000),
    }));
  }
);

// Crear turno desde el panel (carga manual del admin).
app.post(
  "/api/admin/turnos",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const { barberoId, servicioId, fecha, hora, nombre, telefono, email } =
      (request.body ?? {}) as Record<string, string>;
    if (!barberoId || !servicioId || !fecha || !hora || !nombre) {
      return reply.status(400).send({ error: "Faltan datos" });
    }
    const [servicio] = await db
      .select()
      .from(servicios)
      .where(eq(servicios.id, Number(servicioId)));
    if (!servicio) return reply.status(404).send({ error: "Servicio inexistente" });

    const inicio = mkDate(fecha, hora);
    const fin = new Date(inicio.getTime() + servicio.duracionMin * 60000);
    const [creado] = await db
      .insert(turnos)
      .values({
        clienteNombre: nombre.trim(),
        clienteTelefono: telefono?.trim() || null,
        clienteEmail: email?.trim() || null,
        barberoId: Number(barberoId),
        servicioId: Number(servicioId),
        inicio,
        fin,
        estado: "confirmado",
        precio: servicio.precio,
      })
      .returning();
    return reply.status(201).send(creado);
  }
);

// Actualizar un turno: estado, mover (fecha/hora) o reasignar barbero.
app.patch(
  "/api/admin/turnos/:id",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const { estado, fecha, hora, barberoId, notas } = (request.body ??
      {}) as Record<string, string>;

    const [existente] = await db.select().from(turnos).where(eq(turnos.id, id));
    if (!existente) return reply.status(404).send({ error: "Turno no encontrado" });

    const data: Partial<typeof turnos.$inferInsert> = {};
    if (estado) data.estado = estado as typeof existente.estado;
    if (notas !== undefined) data.notas = notas;
    if (barberoId) data.barberoId = Number(barberoId);
    if (fecha && hora) {
      const dur = existente.fin.getTime() - existente.inicio.getTime();
      const inicio = mkDate(fecha, hora);
      data.inicio = inicio;
      data.fin = new Date(inicio.getTime() + dur);
    }

    const [actualizado] = await db
      .update(turnos)
      .set(data)
      .where(eq(turnos.id, id))
      .returning();
    return actualizado;
  }
);

app.delete(
  "/api/admin/turnos/:id",
  { preHandler: requireAdmin },
  async (request) => {
    const id = Number((request.params as { id: string }).id);
    await db.delete(turnos).where(eq(turnos.id, id));
    return { ok: true };
  }
);

// ── Barberos (profesionales) ─────────────────────────────────
app.get(
  "/api/admin/barberos",
  { preHandler: requireAdmin },
  async () => db.select().from(barberos).orderBy(asc(barberos.id))
);

app.post(
  "/api/admin/barberos",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const { nombre, nivel, fotoUrl } = (request.body ?? {}) as Record<
      string,
      string
    >;
    if (!nombre || !nivel) return reply.status(400).send({ error: "Faltan datos" });
    const [creado] = await db
      .insert(barberos)
      .values({
        nombre: nombre.trim(),
        nivel: nivel as "premium" | "estandar",
        fotoUrl: fotoUrl || null,
      })
      .returning();
    return reply.status(201).send(creado);
  }
);

app.patch(
  "/api/admin/barberos/:id",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const { nombre, nivel, activo, fotoUrl } = (request.body ?? {}) as Record<
      string,
      unknown
    >;
    const data: Partial<typeof barberos.$inferInsert> = {};
    if (typeof nombre === "string") data.nombre = nombre.trim();
    if (nivel === "premium" || nivel === "estandar") data.nivel = nivel;
    if (typeof activo === "boolean") data.activo = activo;
    if (fotoUrl !== undefined) data.fotoUrl = fotoUrl ? String(fotoUrl) : null;
    const [actualizado] = await db
      .update(barberos)
      .set(data)
      .where(eq(barberos.id, id))
      .returning();
    if (!actualizado) return reply.status(404).send({ error: "No encontrado" });
    return actualizado;
  }
);

// Baja lógica: preservamos los turnos históricos (FK restrict).
app.delete(
  "/api/admin/barberos/:id",
  { preHandler: requireAdmin },
  async (request) => {
    const id = Number((request.params as { id: string }).id);
    const [actualizado] = await db
      .update(barberos)
      .set({ activo: false })
      .where(eq(barberos.id, id))
      .returning();
    return { ok: true, barbero: actualizado };
  }
);

// Horario semanal de un barbero (para mostrarlo/editarlo en el panel).
app.get(
  "/api/admin/barberos/:id/horarios",
  { preHandler: requireAdmin },
  async (request) => {
    const id = Number((request.params as { id: string }).id);
    return db
      .select()
      .from(horarios)
      .where(eq(horarios.barberoId, id))
      .orderBy(asc(horarios.diaSemana));
  }
);

// Reemplaza el horario semanal completo de un barbero.
// body: { franjas: [{ diaSemana, horaInicio: "HH:MM", horaFin: "HH:MM" }, ...] }
app.put(
  "/api/admin/barberos/:id/horarios",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const { franjas } = (request.body ?? {}) as {
      franjas?: { diaSemana: number; horaInicio: string; horaFin: string }[];
    };
    if (!Array.isArray(franjas)) {
      return reply.status(400).send({ error: "Falta el arreglo de franjas" });
    }
    // Validación básica: fin posterior al inicio y día 0..6.
    for (const f of franjas) {
      if (
        f.diaSemana < 0 ||
        f.diaSemana > 6 ||
        !f.horaInicio ||
        !f.horaFin ||
        f.horaInicio >= f.horaFin
      ) {
        return reply.status(400).send({ error: "Franja inválida" });
      }
    }

    await db.delete(horarios).where(eq(horarios.barberoId, id));
    if (franjas.length) {
      await db.insert(horarios).values(
        franjas.map((f) => ({
          barberoId: id,
          diaSemana: f.diaSemana,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
        }))
      );
    }
    return { ok: true, total: franjas.length };
  }
);

// ── Servicios ────────────────────────────────────────────────
app.get(
  "/api/admin/servicios",
  { preHandler: requireAdmin },
  async () => db.select().from(servicios).orderBy(asc(servicios.id))
);

app.post(
  "/api/admin/servicios",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const { nombre, descripcion, nivel, duracionMin, precio } = (request.body ??
      {}) as Record<string, unknown>;
    if (!nombre || !nivel || !duracionMin || precio === undefined) {
      return reply.status(400).send({ error: "Faltan datos" });
    }
    const [creado] = await db
      .insert(servicios)
      .values({
        nombre: String(nombre).trim(),
        descripcion: descripcion ? String(descripcion) : null,
        nivel: nivel as "premium" | "estandar",
        duracionMin: Number(duracionMin),
        precio: Number(precio),
      })
      .returning();
    return reply.status(201).send(creado);
  }
);

app.patch(
  "/api/admin/servicios/:id",
  { preHandler: requireAdmin },
  async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const b = (request.body ?? {}) as Record<string, unknown>;
    const data: Partial<typeof servicios.$inferInsert> = {};
    if (typeof b.nombre === "string") data.nombre = b.nombre.trim();
    if (b.descripcion !== undefined)
      data.descripcion = b.descripcion ? String(b.descripcion) : null;
    if (b.nivel === "premium" || b.nivel === "estandar") data.nivel = b.nivel;
    if (b.duracionMin !== undefined) data.duracionMin = Number(b.duracionMin);
    if (b.precio !== undefined) data.precio = Number(b.precio);
    if (typeof b.activo === "boolean") data.activo = b.activo;
    const [actualizado] = await db
      .update(servicios)
      .set(data)
      .where(eq(servicios.id, id))
      .returning();
    if (!actualizado) return reply.status(404).send({ error: "No encontrado" });
    return actualizado;
  }
);

app.delete(
  "/api/admin/servicios/:id",
  { preHandler: requireAdmin },
  async (request) => {
    const id = Number((request.params as { id: string }).id);
    const [actualizado] = await db
      .update(servicios)
      .set({ activo: false })
      .where(eq(servicios.id, id))
      .returning();
    return { ok: true, servicio: actualizado };
  }
);

const port = Number(process.env.PORT ?? 3000);
app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => app.log.info(`API escuchando en ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
