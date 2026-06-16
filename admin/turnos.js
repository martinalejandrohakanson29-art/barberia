// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · Lista de turnos con filtros
// ════════════════════════════════════════════════════════════
const ESTADOS = ["pendiente", "confirmado", "completado", "cancelado"];
const ESTADO_LABEL = {
  pendiente: "Pendiente", confirmado: "Confirmado",
  completado: "Completado", cancelado: "Cancelado",
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

(async () => {
  const me = await initShell("turnos");
  if (!me) return;

  // Cargar barberos para el filtro
  const rb = await api("/api/admin/barberos");
  const barberos = await rb.json();
  const fb = $("#f-barbero");
  barberos.forEach((b) =>
    fb.insertAdjacentHTML("beforeend", `<option value="${b.id}">${b.nombre}</option>`)
  );

  // Rango por defecto: una semana atrás → 30 días adelante
  const hoy = new Date();
  $("#f-desde").value = iso(new Date(hoy.getTime() - 7 * 864e5));
  $("#f-hasta").value = iso(new Date(hoy.getTime() + 30 * 864e5));

  $("#f-aplicar").addEventListener("click", cargar);
  $$("#f-estado, #f-barbero, #f-desde, #f-hasta").forEach((el) =>
    el.addEventListener("change", cargar)
  );

  await cargar();
})();

async function cargar() {
  const tb = $("#lista");
  tb.innerHTML = '<tr><td colspan="9" class="empty">Cargando...</td></tr>';
  const params = new URLSearchParams({
    desde: $("#f-desde").value,
    hasta: $("#f-hasta").value,
  });
  if ($("#f-estado").value) params.set("estado", $("#f-estado").value);
  if ($("#f-barbero").value) params.set("barberoId", $("#f-barbero").value);

  const res = await api(`/api/admin/turnos?${params}`);
  let turnos = await res.json();
  // Más recientes primero
  turnos = turnos.sort((a, b) => (a.inicio < b.inicio ? 1 : -1));

  if (!turnos.length) {
    tb.innerHTML = '<tr><td colspan="9" class="empty">No hay turnos con esos filtros.</td></tr>';
    return;
  }
  tb.innerHTML = "";
  turnos.forEach((t) => tb.appendChild(fila(t)));
}

function fila(t) {
  const tr = document.createElement("tr");
  const opciones = ESTADOS.map(
    (e) => `<option value="${e}" ${e === t.estado ? "selected" : ""}>${ESTADO_LABEL[e]}</option>`
  ).join("");
  tr.innerHTML = `
    <td>${t.fecha}</td>
    <td>${t.hora}</td>
    <td>${t.clienteNombre || "—"}</td>
    <td>${t.clienteTelefono || "—"}</td>
    <td>${t.servicioNombre || "—"}</td>
    <td>${t.barberoNombre || "—"}</td>
    <td>${fmtPrecio(t.precio)}</td>
    <td><select class="select" data-estado style="padding:.3rem .5rem">${opciones}</select></td>
    <td style="text-align:right">
      <button class="btn btn--danger btn--sm" data-del>Eliminar</button>
    </td>`;
  tr.querySelector("[data-estado]").addEventListener("change", async (e) => {
    const res = await api(`/api/admin/turnos/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: e.target.value }),
    });
    if (res.ok) toast("Estado actualizado");
  });
  tr.querySelector("[data-del]").addEventListener("click", async () => {
    if (!confirm(`¿Eliminar el turno de ${t.clienteNombre || "este cliente"}?`)) return;
    const res = await api(`/api/admin/turnos/${t.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Turno eliminado");
      tr.remove();
    }
  });
  return tr;
}
