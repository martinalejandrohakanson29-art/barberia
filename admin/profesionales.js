// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · Profesionales (barberos): datos, foto y horarios
// ════════════════════════════════════════════════════════════
let editId = null;
let fotoActual = null; // data URL o null mientras se edita

// Días: el schema usa 0=domingo..6=sábado. Mostramos Lun..Dom.
const DIAS = [
  { n: 1, label: "Lunes" }, { n: 2, label: "Martes" }, { n: 3, label: "Miércoles" },
  { n: 4, label: "Jueves" }, { n: 5, label: "Viernes" }, { n: 6, label: "Sábado" },
  { n: 0, label: "Domingo" },
];

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
  $$("[data-close-h]").forEach((el) =>
    el.addEventListener("click", () => $("#modal-horarios").classList.remove("is-open"))
  );
  $("#mb-foto-file").addEventListener("change", onFoto);
  $("#mb-foto-quitar").addEventListener("click", () => {
    fotoActual = null;
    $("#mb-foto-prev").src = "";
    $("#mb-foto-file").value = "";
  });
  $("#mh-guardar").addEventListener("click", guardarHorarios);
}

async function cargar() {
  const res = await api("/api/admin/barberos");
  const barberos = await res.json();
  const tb = $("#lista");
  if (!barberos.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">Sin barberos cargados.</td></tr>';
    return;
  }
  tb.innerHTML = "";
  barberos.forEach((b) => {
    const tr = document.createElement("tr");
    const avatar = b.fotoUrl
      ? `<img src="${b.fotoUrl}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
      : `<div class="side__avatar" style="width:40px;height:40px">${b.nombre.charAt(0)}</div>`;
    tr.innerHTML = `
      <td>${avatar}</td>
      <td>${b.nombre}</td>
      <td><span class="pill pill--${b.nivel}">${b.nivel}</span></td>
      <td>${b.activo ? "Activo" : "Inactivo"}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn--ghost btn--sm" data-horarios>Horarios</button>
        <button class="btn btn--ghost btn--sm" data-edit>Editar</button>
        ${b.activo ? '<button class="btn btn--danger btn--sm" data-baja>Baja</button>' : ""}
      </td>`;
    tr.querySelector("[data-edit]").addEventListener("click", () => abrirModal(b));
    tr.querySelector("[data-horarios]").addEventListener("click", () => abrirHorarios(b));
    tr.querySelector("[data-baja]")?.addEventListener("click", () => darBaja(b));
    tb.appendChild(tr);
  });
}

// ── Foto: comprimir en el navegador a ~400px ───────────────
function onFoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 400;
      let { width, height } = img;
      if (width > height && width > max) { height = (height * max) / width; width = max; }
      else if (height > max) { width = (width * max) / height; height = max; }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      fotoActual = canvas.toDataURL("image/jpeg", 0.72);
      $("#mb-foto-prev").src = fotoActual;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ── Alta / edición ─────────────────────────────────────────
function abrirModal(b = null) {
  editId = b ? b.id : null;
  fotoActual = b ? b.fotoUrl || null : null;
  $("#mb-title").textContent = b ? "Editar barbero" : "Nuevo barbero";
  $("#mb-nombre").value = b ? b.nombre : "";
  $("#mb-nivel").value = b ? b.nivel : "premium";
  $("#mb-activo").value = b ? String(b.activo) : "true";
  $("#mb-foto-prev").src = fotoActual || "";
  $("#mb-foto-file").value = "";
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
  const body = { nombre, nivel, activo, fotoUrl: fotoActual };
  const res = editId
    ? await api(`/api/admin/barberos/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
    : await api("/api/admin/barberos", { method: "POST", body: JSON.stringify(body) });
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

// ── Horarios ───────────────────────────────────────────────
let horariosBarberoId = null;

async function abrirHorarios(b) {
  horariosBarberoId = b.id;
  $("#mh-barbero").textContent = b.nombre;
  $("#mh-error").hidden = true;

  const res = await api(`/api/admin/barberos/${b.id}/horarios`);
  const franjas = await res.json();
  const porDia = {};
  franjas.forEach((f) => {
    porDia[f.diaSemana] = {
      inicio: f.horaInicio.slice(0, 5),
      fin: f.horaFin.slice(0, 5),
    };
  });

  const cont = $("#mh-dias");
  cont.innerHTML = "";
  DIAS.forEach((d) => {
    const h = porDia[d.n];
    const abierto = !!h;
    const row = document.createElement("div");
    row.style.cssText =
      "display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:.5rem;align-items:center;margin:.4rem 0";
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:.5rem;text-transform:none;letter-spacing:0;color:var(--cream);font-size:.85rem">
        <input type="checkbox" data-dia="${d.n}" ${abierto ? "checked" : ""}> ${d.label}
      </label>
      <input type="time" step="900" class="select" data-ini="${d.n}" value="${h ? h.inicio : "09:00"}">
      <input type="time" step="900" class="select" data-fin="${d.n}" value="${h ? h.fin : "20:00"}">`;
    cont.appendChild(row);
  });
  $("#modal-horarios").classList.add("is-open");
}

async function guardarHorarios() {
  const err = $("#mh-error");
  err.hidden = true;
  const franjas = [];
  for (const d of DIAS) {
    const check = document.querySelector(`[data-dia="${d.n}"]`);
    if (!check.checked) continue;
    const inicio = document.querySelector(`[data-ini="${d.n}"]`).value;
    const fin = document.querySelector(`[data-fin="${d.n}"]`).value;
    if (!inicio || !fin || inicio >= fin) {
      err.textContent = `Revisá el horario de ${d.label}: el fin debe ser posterior al inicio.`;
      err.hidden = false;
      return;
    }
    franjas.push({ diaSemana: d.n, horaInicio: inicio, horaFin: fin });
  }
  const res = await api(`/api/admin/barberos/${horariosBarberoId}/horarios`, {
    method: "PUT",
    body: JSON.stringify({ franjas }),
  });
  if (res.ok) {
    toast("Horarios guardados");
    $("#modal-horarios").classList.remove("is-open");
  } else {
    err.textContent = "No se pudieron guardar los horarios.";
    err.hidden = false;
  }
}
