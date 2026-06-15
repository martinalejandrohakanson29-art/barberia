// ════════════════════════════════════════════════════════════
//  ARCANUS · Flujo de reserva de turnos (landing → API)
//  Pasos: 1) barbero  2) servicio  3) fecha+hora  4) datos
// ════════════════════════════════════════════════════════════
(() => {
  const API = window.ARCANUS_API || "http://localhost:3000";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const modal = $("#booking");
  if (!modal) return;

  const fmtPrecio = (n) =>
    "$" + Number(n).toLocaleString("es-AR");

  const nivelLabel = { premium: "Premium", estandar: "Estándar" };

  // Estado de la reserva en curso
  const state = {
    paso: 1,
    barberos: [],
    servicios: [],
    barbero: null,
    servicio: null,
    fecha: null,
    hora: null,
  };

  // ── Apertura / cierre ──────────────────────────────────────
  const abrir = async () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    reset();
    await cargarCatalogo();
  };

  const cerrar = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  const reset = () => {
    state.paso = 1;
    state.barbero = null;
    state.servicio = null;
    state.fecha = null;
    state.hora = null;
    $("#booking-form").reset();
    $("#booking-fecha").value = "";
    $("#booking-slots").innerHTML =
      '<p class="booking__hint">Elegí una fecha para ver los horarios libres.</p>';
    irAPaso(1);
  };

  // ── Navegación entre pasos ─────────────────────────────────
  const irAPaso = (paso) => {
    state.paso = paso;
    $$(".booking__pane").forEach((p) =>
      p.classList.toggle("is-active", p.dataset.pane === String(paso))
    );
    $$("[data-step-dot]").forEach((d) => {
      const n = Number(d.dataset.stepDot);
      d.classList.toggle("is-active", n === paso);
      d.classList.toggle("is-done", typeof paso === "number" && n < paso);
    });

    const foot = $("#booking-foot");
    const back = $("#booking-back");
    if (paso === "done") {
      foot.style.display = "none";
      return;
    }
    foot.style.display = "";
    back.disabled = paso <= 1;
    $("#booking-progress").textContent = `Paso ${paso} de 4`;
  };

  // ── Carga de catálogo ──────────────────────────────────────
  const cargarCatalogo = async () => {
    try {
      const [rb, rs] = await Promise.all([
        fetch(`${API}/api/barberos`),
        fetch(`${API}/api/servicios`),
      ]);
      state.barberos = await rb.json();
      state.servicios = await rs.json();
      renderBarberos();
    } catch {
      $("#booking-barberos").innerHTML =
        '<p class="booking__hint">No se pudo conectar con el sistema de reservas. Probá de nuevo en unos minutos.</p>';
    }
  };

  const renderBarberos = () => {
    const cont = $("#booking-barberos");
    cont.innerHTML = "";
    state.barberos.forEach((b) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "booking__card";
      card.innerHTML = `
        <span class="booking__card-initial">${b.nombre.charAt(0)}</span>
        <span class="booking__card-name">${b.nombre}</span>
        <span class="booking__card-tag">${nivelLabel[b.nivel] || b.nivel}</span>`;
      card.addEventListener("click", () => {
        state.barbero = b;
        renderServicios();
        irAPaso(2);
      });
      cont.appendChild(card);
    });
  };

  const renderServicios = () => {
    const cont = $("#booking-servicios");
    cont.innerHTML = "";
    // Mostramos los servicios del nivel del barbero elegido.
    const lista = state.servicios.filter((s) => s.nivel === state.barbero.nivel);
    (lista.length ? lista : state.servicios).forEach((s) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "booking__service";
      row.innerHTML = `
        <span class="booking__service-main">
          <span class="booking__service-name">${s.nombre}</span>
          <span class="booking__service-desc">${s.descripcion || ""}</span>
        </span>
        <span class="booking__service-meta">
          <span class="booking__service-price">${fmtPrecio(s.precio)}</span>
          <span class="booking__service-dur">${s.duracionMin} min</span>
        </span>`;
      row.addEventListener("click", () => {
        state.servicio = s;
        prepararFecha();
        irAPaso(3);
      });
      cont.appendChild(row);
    });
  };

  // ── Fecha y horarios ───────────────────────────────────────
  const prepararFecha = () => {
    const input = $("#booking-fecha");
    const hoy = new Date();
    const iso = hoy.toISOString().slice(0, 10);
    input.min = iso;
    const max = new Date(hoy.getTime() + 60 * 24 * 60 * 60 * 1000);
    input.max = max.toISOString().slice(0, 10);
  };

  $("#booking-fecha").addEventListener("change", async (e) => {
    state.fecha = e.target.value;
    state.hora = null;
    if (!state.fecha) return;
    await cargarSlots();
  });

  const cargarSlots = async () => {
    const cont = $("#booking-slots");
    cont.innerHTML = '<p class="booking__hint">Buscando horarios...</p>';
    try {
      const url = `${API}/api/disponibilidad?barberoId=${state.barbero.id}&servicioId=${state.servicio.id}&fecha=${state.fecha}`;
      const res = await fetch(url);
      const slots = await res.json();
      if (!Array.isArray(slots) || slots.length === 0) {
        cont.innerHTML =
          '<p class="booking__hint">No hay horarios libres ese día. Probá con otra fecha.</p>';
        return;
      }
      cont.innerHTML = "";
      slots.forEach((h) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "booking__slot";
        b.textContent = h;
        b.addEventListener("click", () => {
          $$(".booking__slot", cont).forEach((x) =>
            x.classList.remove("is-active")
          );
          b.classList.add("is-active");
          state.hora = h;
          renderResumen();
          irAPaso(4);
        });
        cont.appendChild(b);
      });
    } catch {
      cont.innerHTML =
        '<p class="booking__hint">No se pudieron cargar los horarios.</p>';
    }
  };

  // ── Resumen y confirmación ─────────────────────────────────
  const fechaLegible = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const renderResumen = (target = "#booking-resumen") => {
    $(target).innerHTML = `
      <div class="booking__resumen-row"><span>Barbero</span><strong>${state.barbero.nombre}</strong></div>
      <div class="booking__resumen-row"><span>Servicio</span><strong>${state.servicio.nombre}</strong></div>
      <div class="booking__resumen-row"><span>Día</span><strong>${fechaLegible(state.fecha)}</strong></div>
      <div class="booking__resumen-row"><span>Hora</span><strong>${state.hora} hs</strong></div>
      <div class="booking__resumen-row"><span>Precio</span><strong>${fmtPrecio(state.servicio.precio)}</strong></div>`;
  };

  $("#booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#booking-error");
    err.hidden = true;
    const btn = $("#booking-submit");
    const fd = new FormData(e.target);

    btn.disabled = true;
    btn.textContent = "Reservando...";
    try {
      const res = await fetch(`${API}/api/turnos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberoId: state.barbero.id,
          servicioId: state.servicio.id,
          fecha: state.fecha,
          hora: state.hora,
          nombre: fd.get("nombre"),
          telefono: fd.get("telefono"),
          email: fd.get("email"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo reservar");
      renderResumen("#booking-resumen-final");
      irAPaso("done");
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmar reserva";
    }
  });

  // ── Botón atrás ────────────────────────────────────────────
  $("#booking-back").addEventListener("click", () => {
    if (typeof state.paso === "number" && state.paso > 1) irAPaso(state.paso - 1);
  });

  // ── Triggers de apertura/cierre ────────────────────────────
  $$("[data-reservar]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      abrir();
    })
  );
  $$("[data-booking-close]").forEach((el) =>
    el.addEventListener("click", cerrar)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) cerrar();
  });
})();
