// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · Profesionales (barberos)
// ════════════════════════════════════════════════════════════
let editId = null;

(async () => {
  const me = await initShell("profesionales");
  if (!me) return;
  bind();
  await cargar();
})();

function bind() {
  $("#nuevo").addEventListener("click", () => abrirModal());
  $("#mb-guardar").addEventListener("click", guardar);
  $$("[data-close]").forEach((el) =>
    el.addEventListener("click", () => $("#modal-barbero").classList.remove("is-open"))
  );
}

async function cargar() {
  const res = await api("/api/admin/barberos");
  const barberos = await res.json();
  const tb = $("#lista");
  if (!barberos.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty">Sin barberos cargados.</td></tr>';
    return;
  }
  tb.innerHTML = "";
  barberos.forEach((b) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.nombre}</td>
      <td><span class="pill pill--${b.nivel}">${b.nivel}</span></td>
      <td>${b.activo ? "Activo" : "Inactivo"}</td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" data-edit>Editar</button>
        ${b.activo ? '<button class="btn btn--danger btn--sm" data-baja>Dar de baja</button>' : ""}
      </td>`;
    tr.querySelector("[data-edit]").addEventListener("click", () => abrirModal(b));
    tr.querySelector("[data-baja]")?.addEventListener("click", () => darBaja(b));
    tb.appendChild(tr);
  });
}

function abrirModal(b = null) {
  editId = b ? b.id : null;
  $("#mb-title").textContent = b ? "Editar barbero" : "Nuevo barbero";
  $("#mb-nombre").value = b ? b.nombre : "";
  $("#mb-nivel").value = b ? b.nivel : "premium";
  $("#mb-activo").value = b ? String(b.activo) : "true";
  $("#mb-error").hidden = true;
  $("#modal-barbero").classList.add("is-open");
}

async function guardar() {
  const err = $("#mb-error");
  err.hidden = true;
  const nombre = $("#mb-nombre").value.trim();
  const nivel = $("#mb-nivel").value;
  const activo = $("#mb-activo").value === "true";
  if (!nombre) {
    err.textContent = "El nombre es obligatorio.";
    err.hidden = false;
    return;
  }
  const res = editId
    ? await api(`/api/admin/barberos/${editId}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre, nivel, activo }),
      })
    : await api("/api/admin/barberos", {
        method: "POST",
        body: JSON.stringify({ nombre, nivel }),
      });
  if (res.ok) {
    toast(editId ? "Barbero actualizado" : "Barbero creado");
    $("#modal-barbero").classList.remove("is-open");
    await cargar();
  } else {
    err.textContent = "No se pudo guardar.";
    err.hidden = false;
  }
}

async function darBaja(b) {
  if (!confirm(`¿Dar de baja a ${b.nombre}? Sus turnos históricos se conservan.`)) return;
  const res = await api(`/api/admin/barberos/${b.id}`, { method: "DELETE" });
  if (res.ok) {
    toast("Barbero dado de baja");
    await cargar();
  }
}
