// ════════════════════════════════════════════════════════════
//  ARCANUS Admin · utilidades compartidas
// ════════════════════════════════════════════════════════════
const API = window.ARCANUS_API || "http://localhost:3000";

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// fetch con credenciales (cookie de sesión de Better Auth)
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    location.href = "login.html";
    throw new Error("No autorizado");
  }
  return res;
}

// Carga la sesión actual y dibuja la barra lateral. Redirige al login si no hay.
async function initShell(activa) {
  let me;
  try {
    const res = await api("/api/admin/me");
    if (!res.ok) throw new Error();
    me = await res.json();
  } catch {
    location.href = "login.html";
    return null;
  }

  const inicial = (me.name || me.email || "A").charAt(0).toUpperCase();
  $("#side-avatar") && ($("#side-avatar").textContent = inicial);
  $("#side-uname") && ($("#side-uname").textContent = me.name || me.email);
  $("#side-urole") && ($("#side-urole").textContent = me.rol || "");

  $$(".side__link").forEach((l) =>
    l.classList.toggle("is-active", l.dataset.nav === activa)
  );

  // Logout
  $("#logout")?.addEventListener("click", async () => {
    await fetch(`${API}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
    location.href = "login.html";
  });

  // Menú móvil
  const side = $(".side");
  const back = $(".backdrop-side");
  $("#burger")?.addEventListener("click", () => {
    side.classList.add("is-open");
    back.classList.add("is-open");
  });
  back?.addEventListener("click", () => {
    side.classList.remove("is-open");
    back.classList.remove("is-open");
  });

  return me;
}

let _toastT;
function toast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

const fmtPrecio = (n) => "$" + Number(n || 0).toLocaleString("es-AR");
