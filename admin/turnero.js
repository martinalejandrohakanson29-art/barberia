// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · Turnero (grilla semanal)
// ════════════════════════════════════════════════════════════
const ROW_H = 56;        // alto de cada franja de 30 min (px)
const START_MIN = 5 * 60; // 05:00
const END_MIN = 22 * 60;  // 22:00
const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ── Utilidades de fecha (sin librerías) ────────────────────
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lunesDe = (d) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
};
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// ── Estado ─────────────────────────────────────────────────
let lunes = lunesDe(new Date());
let barberos = [];
let servicios = [];
let turnos = [];
let filtro = "all";
let turnoActivo = null;

// ── Init ───────────────────────────────────────────────────
(async () => {
  const me = await initShell("turnero");
  if (!me) return;

  await cargarBarberosServicios();
  bindControles();
  await cargarSemana();
})();

async function cargarBarberosServicios() {
  const [rb, rs] = await Promise.all([
    api("/api/admin/barberos"),
    api("/api/admin/servicios"),
  ]);
  barberos = await rb.json();
  servicios = await rs.json();

  const sel = $("#filtro-barbero");
  barberos
    .filter((b) => b.activo)
    .forEach((b) => {
      sel.insertAdjacentHTML("beforeend", `<option value="${b.id}">${b.nombre}</option>`);
    });

  // selects del modal nuevo turno
  const nb = $("#n-barbero");
  barberos.filter((b) => b.activo).forEach((b) =>
    nb.insertAdjacentHTML("beforeend", `<option value="${b.id}">${b.nombre} (${b.nivel})</option>`)
  );
  renderServiciosNuevo();
}

function renderServiciosNuevo() {
  const barberoId = Number($("#n-barbero").value);
  const b = barberos.find((x) => x.id === barberoId);
  const ns = $("#n-servicio");
  ns.innerHTML = "";
  servicios
    .filter((s) => s.activo && (!b || s.nivel === b.nivel))
    .forEach((s) =>
      ns.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.nombre} · ${s.duracionMin}min · ${fmtPrecio(s.precio)}</option>`)
    );
}

function bindControles() {
  $("#prev").addEventListener("click", () => { lunes = addDays(lunes, -7); cargarSemana(); });
  $("#next").addEventListener("click", () => { lunes = addDays(lunes, 7); cargarSemana(); });
  $("#today").addEventListener("click", () => { lunes = lunesDe(new Date()); cargarSemana(); });
  $("#filtro-barbero").addEventListener("change", (e) => { filtro = e.target.value; render(); });

  // Modales: cierre
  $$("[data-close]").forEach((el) =>
    el.addEventListener("click", () => {
      $("#modal-turno").classList.remove("is-open");
      $("#modal-nuevo").classList.remove("is-open");
    })
  );

  // Acciones de estado
  $$("#modal-turno [data-estado]").forEach((b) =>
    b.addEventListener("click", () => cambiarEstado(b.dataset.estado))
  );
  $("#mt-eliminar").addEventListener("click", eliminarTurno);
  $("#mt-mover").addEventListener("click", moverTurno);

  // Nuevo turno
  $("#nuevo").addEventListener("click", abrirNuevo);
  $("#n-barbero").addEventListener("change", () => { renderServiciosNuevo(); cargarSlotsNuevo(); });
  $("#n-servicio").addEventListener("change", cargarSlotsNuevo);
  $("#n-fecha").addEventListener("change", cargarSlotsNuevo);
  $("#n-guardar").addEventListener("click", guardarNuevo);
}

async function cargarSemana() {
  const desde = iso(lunes);
  const hasta = iso(addDays(lunes, 5));
  const fin = addDays(lunes, 5);
  $("#weeklabel").textContent =
    `${lunes.getDate()} ${MESES[lunes.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`;
  const res = await api(`/api/admin/turnos?desde=${desde}&hasta=${hasta}`);
  turnos = await res.json();
  render();
}

// ── Render de la grilla ────────────────────────────────────
function render() {
  const cont = $("#agenda");
  const dias = Array.from({ length: 6 }, (_, i) => addDays(lunes, i));
  const hoyIso = iso(new Date());

  // Cabecera
  let head = '<div class="agenda__head"><div class="agenda__corner"></div>';
  dias.forEach((d) => {
    const today = iso(d) === hoyIso ? " is-today" : "";
    head += `<div class="agenda__daycol${today}"><div class="agenda__dow">${DOW[d.getDay()]}</div><div class="agenda__dnum">${d.getDate()}</div></div>`;
  });
  head += "</div>";

  // Eje horario + columnas
  let axis = '<div class="agenda__axis">';
  for (let m = START_MIN; m < END_MIN; m += 30) {
    const esHora = m % 60 === 0;
    axis += `<div class="agenda__slot${esHora ? " hour" : ""}">${esHora ? `${pad(m / 60)}:00` : ""}</div>`;
  }
  axis += "</div>";

  const totalH = ((END_MIN - START_MIN) / 30) * ROW_H;
  let cols = "";
  dias.forEach((d, i) => {
    cols += `<div class="agenda__col" data-day="${i}" style="height:${totalH}px"></div>`;
  });

  cont.innerHTML = head + `<div class="agenda__grid">${axis}${cols}</div>`;

  // Colocar turnos
  const visibles = turnos.filter(
    (t) => filtro === "all" || String(t.barberoId) === String(filtro)
  );
  visibles.forEach((t) => {
    const dayIdx = dias.findIndex((d) => iso(d) === t.fecha);
    if (dayIdx < 0) return;
    const startMin = toMin(t.hora);
    if (startMin < START_MIN || startMin >= END_MIN) return;
    const col = cont.querySelector(`.agenda__col[data-day="${dayIdx}"]`);
    const top = ((startMin - START_MIN) / 30) * ROW_H;
    const h = Math.max(24, (t.duracion / 30) * ROW_H - 3);
    const el = document.createElement("div");
    el.className = "appt";
    el.dataset.estado = t.estado;
    el.style.top = `${top}px`;
    el.style.height = `${h}px`;
    el.innerHTML = `
      <div class="appt__name">${t.clienteNombre || "Cliente"}</div>
      <div class="appt__svc">${t.servicioNombre || ""}</div>
      <div class="appt__barb">${t.barberoNombre || ""} · ${t.hora}</div>`;
    el.addEventListener("click", () => abrirTurno(t));
    col.appendChild(el);
  });
}

// ── Modal de turno ─────────────────────────────────────────
const ESTADO_LABEL = {
  pendiente: "Pendiente", confirmado: "Confirmado",
  cancelado: "Cancelado", completado: "Completado",
};

function abrirTurno(t) {
  turnoActivo = t;
  $("#mt-nombre").textContent = t.clienteNombre || "Cliente";
  $("#mt-cuando").textContent = `${t.fecha} · ${t.hora} hs`;
  $("#mt-servicio").textContent = t.servicioNombre || "—";
  $("#mt-barbero").textContent = t.barberoNombre || "—";
  $("#mt-duracion").textContent = `${t.duracion} min`;
  $("#mt-precio").textContent = fmtPrecio(t.precio);
  $("#mt-tel").textContent = t.clienteTelefono || "—";
  $("#mt-estado").textContent = ESTADO_LABEL[t.estado] || t.estado;
  $("#mt-fecha").value = t.fecha;
  $("#mt-hora").value = t.hora;
  $("#modal-turno").classList.add("is-open");
}

async function cambiarEstado(estado) {
  if (!turnoActivo) return;
  const res = await api(`/api/admin/turnos/${turnoActivo.id}`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });
  if (res.ok) {
    toast(`Turno ${ESTADO_LABEL[estado].toLowerCase()}`);
    $("#modal-turno").classList.remove("is-open");
    await cargarSemana();
  }
}

async function moverTurno() {
  if (!turnoActivo) return;
  const fecha = $("#mt-fecha").value;
  const hora = $("#mt-hora").value;
  if (!fecha || !hora) return;
  const res = await api(`/api/admin/turnos/${turnoActivo.id}`, {
    method: "PATCH",
    body: JSON.stringify({ fecha, hora }),
  });
  if (res.ok) {
    toast("Turno reprogramado");
    $("#modal-turno").classList.remove("is-open");
    await cargarSemana();
  }
}

async function eliminarTurno() {
  if (!turnoActivo) return;
  if (!confirm(`¿Eliminar el turno de ${turnoActivo.clienteNombre || "este cliente"}?`)) return;
  const res = await api(`/api/admin/turnos/${turnoActivo.id}`, { method: "DELETE" });
  if (res.ok) {
    toast("Turno eliminado");
    $("#modal-turno").classList.remove("is-open");
    await cargarSemana();
  }
}

// ── Nuevo turno ────────────────────────────────────────────
function abrirNuevo() {
  $("#n-error").hidden = true;
  $("#n-nombre").value = "";
  $("#n-tel").value = "";
  $("#n-fecha").value = iso(new Date());
  $("#n-fecha").min = iso(new Date());
  renderServiciosNuevo();
  $("#n-slots").innerHTML = "";
  $("#modal-nuevo").classList.add("is-open");
  cargarSlotsNuevo();
}

let slotElegido = null;
async function cargarSlotsNuevo() {
  slotElegido = null;
  const barberoId = $("#n-barbero").value;
  const servicioId = $("#n-servicio").value;
  const fecha = $("#n-fecha").value;
  const cont = $("#n-slots");
  if (!barberoId || !servicioId || !fecha) return;
  cont.innerHTML = '<p class="booking__hint" style="grid-column:1/-1;color:var(--muted)">Buscando...</p>';
  try {
    const res = await api(
      `/api/disponibilidad?barberoId=${barberoId}&servicioId=${servicioId}&fecha=${fecha}`
    );
    const slots = await res.json();
    if (!Array.isArray(slots) || !slots.length) {
      cont.innerHTML = '<p style="grid-column:1/-1;color:var(--muted);font-size:.8rem">Sin horarios libres.</p>';
      return;
    }
    cont.innerHTML = "";
    slots.forEach((h) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "booking__slot";
      b.textContent = h;
      b.addEventListener("click", () => {
        cont.querySelectorAll(".booking__slot").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        slotElegido = h;
      });
      cont.appendChild(b);
    });
  } catch {
    cont.innerHTML = '<p style="grid-column:1/-1;color:#e0796b;font-size:.8rem">Error al cargar horarios.</p>';
  }
}

async function guardarNuevo() {
  const err = $("#n-error");
  err.hidden = true;
  const nombre = $("#n-nombre").value.trim();
  if (!slotElegido || !nombre) {
    err.textContent = "Elegí un horario y cargá el nombre del cliente.";
    err.hidden = false;
    return;
  }
  const res = await api("/api/admin/turnos", {
    method: "POST",
    body: JSON.stringify({
      barberoId: $("#n-barbero").value,
      servicioId: $("#n-servicio").value,
      fecha: $("#n-fecha").value,
      hora: slotElegido,
      nombre,
      telefono: $("#n-tel").value.trim(),
    }),
  });
  if (res.ok) {
    toast("Turno creado");
    $("#modal-nuevo").classList.remove("is-open");
    await cargarSemana();
  } else {
    const d = await res.json().catch(() => ({}));
    err.textContent = d.error || "No se pudo crear el turno.";
    err.hidden = false;
  }
}
