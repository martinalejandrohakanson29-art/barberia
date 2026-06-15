// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · Servicios
// ════════════════════════════════════════════════════════════
let editId = null;

(async () => {
  const me = await initShell("servicios");
  if (!me) return;
  bind();
  await cargar();
})();

function bind() {
  $("#nuevo").addEventListener("click", () => abrirModal());
  $("#ms-guardar").addEventListener("click", guardar);
  $$("[data-close]").forEach((el) =>
    el.addEventListener("click", () => $("#modal-servicio").classList.remove("is-open"))
  );
}

async function cargar() {
  const res = await api("/api/admin/servicios");
  const servicios = await res.json();
  const tb = $("#lista");
  if (!servicios.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">Sin servicios cargados.</td></tr>';
    return;
  }
  tb.innerHTML = "";
  servicios.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.nombre}</td>
      <td><span class="pill pill--${s.nivel}">${s.nivel}</span></td>
      <td>${s.duracionMin} min</td>
      <td>${fmtPrecio(s.precio)}</td>
      <td>${s.activo ? "Activo" : "Inactivo"}</td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" data-edit>Editar</button>
        ${s.activo ? '<button class="btn btn--danger btn--sm" data-baja>Baja</button>' : ""}
      </td>`;
    tr.querySelector("[data-edit]").addEventListener("click", () => abrirModal(s));
    tr.querySelector("[data-baja]")?.addEventListener("click", () => darBaja(s));
    tb.appendChild(tr);
  });
}

function abrirModal(s = null) {
  editId = s ? s.id : null;
  $("#ms-title").textContent = s ? "Editar servicio" : "Nuevo servicio";
  $("#ms-nombre").value = s ? s.nombre : "";
  $("#ms-desc").value = s ? s.descripcion || "" : "";
  $("#ms-nivel").value = s ? s.nivel : "premium";
  $("#ms-dur").value = s ? s.duracionMin : 60;
  $("#ms-precio").value = s ? s.precio : 0;
  $("#ms-activo").value = s ? String(s.activo) : "true";
  $("#ms-error").hidden = true;
  $("#modal-servicio").classList.add("is-open");
}

async function guardar() {
  const err = $("#ms-error");
  err.hidden = true;
  const body = {
    nombre: $("#ms-nombre").value.trim(),
    descripcion: $("#ms-desc").value.trim(),
    nivel: $("#ms-nivel").value,
    duracionMin: Number($("#ms-dur").value),
    precio: Number($("#ms-precio").value),
    activo: $("#ms-activo").value === "true",
  };
  if (!body.nombre || !body.duracionMin) {
    err.textContent = "Completá nombre y duración.";
    err.hidden = false;
    return;
  }
  const res = editId
    ? await api(`/api/admin/servicios/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
    : await api("/api/admin/servicios", { method: "POST", body: JSON.stringify(body) });
  if (res.ok) {
    toast(editId ? "Servicio actualizado" : "Servicio creado");
    $("#modal-servicio").classList.remove("is-open");
    await cargar();
  } else {
    err.textContent = "No se pudo guardar.";
    err.hidden = false;
  }
}

async function darBaja(s) {
  if (!confirm(`¿Dar de baja el servicio "${s.nombre}"?`)) return;
  const res = await api(`/api/admin/servicios/${s.id}`, { method: "DELETE" });
  if (res.ok) {
    toast("Servicio dado de baja");
    await cargar();
  }
}
