/* =========================================================
   TechStore — Frontend conectado al API Gateway real
   Gateway: http://localhost:3000
   Si el backend no responde → fallback automático a mocks
   ========================================================= */

const API_BASE = "http://localhost:3000"; 
const TOKEN_KEY = "techstore_token";

/* ---------- ESTADO ---------- */
let state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  cart: [],
  products: [],
  cotizacion: null,
  orders: [],
  perfilCliente: null,
  usandoMocks: false,
};

/* ---------- HELPERS ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function toast(msg, type = "success") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 3200);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (networkErr) {
    throw new Error("No se pudo conectar al servidor. ¿Está levantado el gateway?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
  return data;
}

/* ---------- NAVEGACIÓN ---------- */
function showView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById(`view-${name}`);
  if (el) el.classList.add("active");

  if (name === "catalogo") loadProducts();
  if (name === "carrito") renderCart();
  if (name === "checkout") updateCheckoutTotal();
  if (name === "pedidos") loadOrders();
  if (name === "perfil") loadProfile();

  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.showView = showView;

$$(".nav-links a").forEach((a) =>
  a.addEventListener("click", (e) => { e.preventDefault(); showView(a.dataset.view); })
);

/* ---------- AUTH ---------- */
$("#btn-login").addEventListener("click", () => $("#modal-login").classList.remove("hidden"));
$("#btn-register").addEventListener("click", () => $("#modal-register").classList.remove("hidden"));
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }
window.closeModal = closeModal;

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  try {
    const data = await api("/api/usuarios/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    state.token = data.token;
    state.user = data.usuario;
    localStorage.setItem(TOKEN_KEY, data.token);
    closeModal("modal-login");
    updateAuthUI();
    toast(`¡Bienvenido, ${state.user.nombre}!`);
    showView("perfil");
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#reg-nombre").value.trim();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  try {
    await api("/api/usuarios/auth/register", {
      method: "POST",
      body: JSON.stringify({ nombre, email, password }),
    });
    toast("Cuenta creada. Ahora iniciá sesión.");
    closeModal("modal-register");
    $("#login-email").value = email;
    $("#login-password").value = "";
    $("#modal-login").classList.remove("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#btn-logout").addEventListener("click", () => {
  state.token = null;
  state.user = null;
  state.perfilCliente = null;
  state.orders = [];
  localStorage.removeItem(TOKEN_KEY);
  updateAuthUI();
  toast("Sesión cerrada", "info");
  showView("home");
});

function updateAuthUI() {
  const logged = !!state.token;
  $("#btn-login").classList.toggle("hidden", logged);
  $("#btn-register").classList.toggle("hidden", logged);
  $("#btn-logout").classList.toggle("hidden", !logged);
}

/* ---------- PRODUCTOS ---------- */
const MOCK_PRODUCTS = [
  { id: 1, nombre: "Notebook Pro 14", descripcion: "Intel i7 · 16GB RAM · 512GB SSD", precio: 1299.99, stock: 8, categoria: "laptops" },
  { id: 2, nombre: "Notebook Ultra 13", descripcion: "Ryzen 5 · 8GB RAM · 256GB SSD", precio: 899.00, stock: 12, categoria: "laptops" },
  { id: 3, nombre: "Auriculares BT Pro", descripcion: "Cancelación activa de ruido", precio: 199.50, stock: 25, categoria: "audio" },
  { id: 4, nombre: "Parlante Bluetooth", descripcion: "Portátil · 20W · resistente al agua", precio: 89.99, stock: 30, categoria: "audio" },
  { id: 5, nombre: "Mouse Gamer RGB", descripcion: "16000 DPI · 8 botones programables", precio: 59.90, stock: 50, categoria: "accesorios" },
  { id: 6, nombre: "Teclado Mecánico", descripcion: "Switches red · Layout TKL", precio: 119.00, stock: 15, categoria: "accesorios" },
  { id: 7, nombre: 'Monitor 27" 4K', descripcion: "IPS · 144Hz · HDR10", precio: 449.00, stock: 5, categoria: "monitores" },
  { id: 8, nombre: 'Monitor UltraWide 34"', descripcion: "Curvo · 165Hz · USB-C", precio: 699.00, stock: 3, categoria: "monitores" },
  { id: 9, nombre: "Webcam Full HD", descripcion: "1080p · micrófono integrado", precio: 79.99, stock: 0, categoria: "accesorios" },
];

const EMOJIS = { laptops: "💻", audio: "🎧", accesorios: "🖱️", monitores: "🖥️", default: "📦" };
function emojiFor(p) { return EMOJIS[p.categoria] || EMOJIS.default; }

async function loadProducts() {
  const grid = $("#products-grid");
  grid.innerHTML = `<p class="empty-msg">Cargando productos...</p>`;
  try {
    const data = await api("/api/productos");
    state.cotizacion = data.cotizacion || null;
    state.products = (data.productos || []).map((p) => ({
      ...p,
      precio: Number(p.precio),
      stock: Number(p.stock),
    }));
    state.usandoMocks = false;
  } catch (err) {
    console.warn("Backend no disponible, usando mocks:", err.message);
    state.products = MOCK_PRODUCTS;
    state.cotizacion = { compra: 950, venta: 1000, moneda: "ARS" };
    state.usandoMocks = true;
  }

  const cot = $("#cotizacion-info");
  if (state.cotizacion) {
    cot.textContent = `💵 Dólar ${state.cotizacion.moneda || "ARS"}: compra $${state.cotizacion.compra} · venta $${state.cotizacion.venta}`;
    cot.classList.remove("hidden");
  } else {
    cot.classList.add("hidden");
  }

  renderProducts(state.products);
}

function renderProducts(list) {
  const grid = $("#products-grid");
  if (!list.length) {
    grid.innerHTML = `<p class="empty-msg">No se encontraron productos.</p>`;
    return;
  }
  grid.innerHTML = list.map((p) => {
    const sinStock = p.stock <= 0;
    const stockClass = sinStock ? "out" : p.stock <= 5 ? "low" : "";
    const stockText = sinStock ? "Sin stock" : `Stock: ${p.stock}${p.stock <= 5 ? " ⚠️" : ""}`;
    const usd = p.precioUSD
      ? `<span class="price-usd">≈ USD ${Number(p.precioUSD).toFixed(2)}</span>`
      : "";
    return `
    <div class="product-card">
      <div class="product-img">${emojiFor(p)}</div>
      <div class="product-body">
        <h4>${p.nombre}</h4>
        <p class="desc">${p.descripcion || ""}</p>
        <span class="price">$${p.precio.toFixed(2)}</span>
        ${usd}
        <span class="stock ${stockClass}">${stockText}</span>
        <button class="btn-primary" ${sinStock ? "disabled" : ""} onclick="addToCart(${p.id})">
          ${sinStock ? "Sin stock" : "Agregar al carrito"}
        </button>
      </div>
    </div>`;
  }).join("");
}

$("#search-input").addEventListener("input", () => {
  const q = $("#search-input").value.toLowerCase();
  const cat = $("#category-select").value;
  applyFilters(q, cat);
});
$("#category-select").addEventListener("change", () => {
  const q = $("#search-input").value.toLowerCase();
  applyFilters(q, $("#category-select").value);
});

function applyFilters(query, category) {
  let list = [...state.products];
  if (query) list = list.filter((p) => p.nombre.toLowerCase().includes(query));
  if (category) list = list.filter((p) => p.categoria === category);
  renderProducts(list);
}

/* ---------- CARRITO ---------- */
function addToCart(id) {
  const prod = state.products.find((p) => p.id === id || p.id === Number(id));
  if (!prod) return;
  const existing = state.cart.find((i) => i.id === prod.id);
  if (existing) existing.qty++;
  else state.cart.push({ ...prod, qty: 1 });
  updateCartCount();
  toast(`${prod.nombre} agregado 🛒`);
}
window.addToCart = addToCart;

function updateCartCount() {
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  $("#cart-count").textContent = total;
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((i) => i.id !== id);
  updateCartCount();
  renderCart();
}
window.changeQty = changeQty;

function removeItem(id) {
  state.cart = state.cart.filter((i) => i.id !== id);
  updateCartCount();
  renderCart();
  toast("Producto eliminado", "info");
}
window.removeItem = removeItem;

function cartTotal() {
  return state.cart.reduce((s, i) => s + i.precio * i.qty, 0);
}

function renderCart() {
  const cont = $("#cart-items");
  const footer = $("#cart-footer");

  if (!state.cart.length) {
    cont.innerHTML = `<p class="empty-msg">Tu carrito está vacío</p>`;
    footer.classList.add("hidden");
    return;
  }

  cont.innerHTML = state.cart.map((i) => `
    <div class="cart-item">
      <div class="thumb">${emojiFor(i)}</div>
      <div class="info">
        <strong>${i.nombre}</strong>
        <small>$${i.precio.toFixed(2)} c/u</small>
      </div>
      <div class="controls">
        <button class="qty-btn" onclick="changeQty(${i.id}, -1)">−</button>
        <span>${i.qty}</span>
        <button class="qty-btn" onclick="changeQty(${i.id}, 1)">+</button>
      </div>
      <strong class="subtotal">$${(i.precio * i.qty).toFixed(2)}</strong>
      <button class="remove" onclick="removeItem(${i.id})" title="Quitar">🗑️</button>
    </div>`
  ).join("");

  $("#cart-total").textContent = cartTotal().toFixed(2);
  footer.classList.remove("hidden");
}

$("#btn-cart").addEventListener("click", () => showView("carrito"));

/* ---------- CHECKOUT ---------- */
function updateCheckoutTotal() {
  $("#checkout-total").textContent = cartTotal().toFixed(2);
}

$("#checkout-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.token) {
    toast("Iniciá sesión para comprar", "error");
    $("#modal-login").classList.remove("hidden");
    return;
  }
  if (!state.cart.length) return toast("Tu carrito está vacío", "error");

  const direccion = $("#direccion").value.trim();
  if (!direccion) return toast("Ingresá una dirección", "error");

  // Payload exacto según pedidosController.crearPedido
  const body = {
    items: state.cart.map((i) => ({ productoId: i.id, cantidad: i.qty })),
    direccionEntrega: direccion,
  };

  try {
    const pedido = await api("/api/pedidos", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.cart = [];
    updateCartCount();
    toast(`¡Pedido #${pedido.id} confirmado! 🎉`);
    showView("pedidos");
  } catch (err) {
    toast(err.message, "error");
  }
});

/* ---------- PEDIDOS ---------- */
async function loadOrders() {
  const cont = $("#orders-list");

  if (!state.token) {
    cont.innerHTML = `<p class="empty-msg">Iniciá sesión para ver tus pedidos.</p>`;
    return;
  }
  cont.innerHTML = `<p class="empty-msg">Cargando pedidos...</p>`;

  try {
    const pedidos = await api("/api/pedidos/mis-pedidos");
    state.orders = Array.isArray(pedidos) ? pedidos : [];
    renderOrders(state.orders);
  } catch (err) {
    cont.innerHTML = `<p class="empty-msg">No se pudieron cargar los pedidos: ${err.message}</p>`;
  }
}

function renderOrders(list) {
  const cont = $("#orders-list");
  if (!list.length) {
    cont.innerHTML = `<p class="empty-msg">No tenés pedidos todavía.</p>`;
    return;
  }
  cont.innerHTML = list.map((o) => {
    const cancelado = (o.estado || "").toLowerCase() === "cancelado";
    const estado = (o.estado || "pendiente").toUpperCase();
    const fecha = o.created_at ? new Date(o.created_at).toLocaleString("es-AR") : "—";
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsHtml = items.length
      ? `<ul class="items-list">${items.map((it) =>
          `<li>• ${it.nombre_producto || it.nombreProducto || "Producto"} × ${it.cantidad} — $${Number(it.precio_unitario ?? it.precioUnitario ?? 0).toFixed(2)}</li>`
        ).join("")}</ul>`
      : "";
    return `
    <div class="order-card ${cancelado ? "cancelado" : ""}">
      <div class="order-head">
        <span>Pedido #${o.id}</span>
        <span class="status ${cancelado ? "cancelado" : ""}">${estado}</span>
      </div>
      <div class="order-meta">
        <span>Total: <strong>$${Number(o.total).toFixed(2)}</strong></span>
        <span>Dirección: ${o.direccion_entrega || "—"}</span>
        <span>${fecha}</span>
      </div>
      ${itemsHtml}
      ${!cancelado ? `<button class="btn-cancelar" onclick="cancelOrder(${o.id})">Cancelar pedido</button>` : ""}
    </div>`;
  }).join("");
}

async function cancelOrder(id) {
  if (!confirm("¿Cancelar este pedido? El stock se restaura.")) return;
  try {
    await api(`/api/pedidos/${id}/cancelar`, { method: "PUT" });
    toast("Pedido cancelado", "info");
    loadOrders();
  } catch (err) {
    toast(err.message, "error");
  }
}
window.cancelOrder = cancelOrder;

/* ---------- PERFIL ---------- */
async function loadProfile() {
  const container = $("#cliente-form-container");
  const perfilInfo = $(".profile-info");

  // Datos del usuario logueado (del JWT)
  if (state.user) {
    $("#profile-nombre").textContent = state.user.nombre || "Usuario";
    $("#profile-email").textContent = state.user.email || "—";
    $("#profile-rol").textContent = state.user.rol || "—";
  } else {
    $("#profile-nombre").textContent = "Invitado";
    $("#profile-email").textContent = "Sin sesión iniciada";
    $("#profile-rol").textContent = "—";
    $("#profile-dni").textContent = "—";
    $("#profile-telefono").textContent = "—";
    $("#profile-direcciones").innerHTML = "<li>—</li>";
    container.classList.add("hidden");
    return;
  }

  // Sin token no consultamos ms-clientes
  if (!state.token) return;

  try {
    const cliente = await api("/api/clientes/perfil");
    state.perfilCliente = cliente;
    $("#profile-dni").textContent = cliente.dni || "—";
    $("#profile-telefono").textContent = cliente.telefono || "—";
    const dirs = Array.isArray(cliente.direcciones) ? cliente.direcciones : [];
    $("#profile-direcciones").innerHTML = dirs.length
      ? dirs.map((d) => `<li>${d.calle || ""} ${d.numero || ""} — ${d.ciudad || ""} ${d.esPredeterminada ? "⭐" : ""}</li>`).join("")
      : "<li>Sin direcciones cargadas</li>";
    container.classList.add("hidden");
  } catch (err) {
    // 404 = el cliente no existe todavía → mostrar formulario de creación
    if (/no encontrado|404/i.test(err.message)) {
      state.perfilCliente = null;
      $("#profile-dni").textContent = "—";
      $("#profile-telefono").textContent = "—";
      $("#profile-direcciones").innerHTML = "<li>Completá el formulario para crear tu perfil</li>";
      container.classList.remove("hidden");
    } else {
      toast(err.message, "error");
    }
  }
}

/* ---------- CREAR PERFIL DE CLIENTE (POST /api/clientes) ---------- */
$("#cliente-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    nombre: $("#cl-nombre").value.trim(),
    apellido: $("#cl-apellido").value.trim(),
    dni: $("#cl-dni").value.trim(),
    telefono: $("#cl-telefono").value.trim() || undefined,
  };
  try {
    await api("/api/clientes", {
      method: "POST",
      body: JSON.stringify(body),
    });
    toast("Perfil de cliente creado ✅");
    loadProfile();
  } catch (err) {
    toast(err.message, "error");
  }
});

/* ---------- INIT ---------- */
updateAuthUI();
updateCartCount();
// Si hay token guardado, cargamos el catálogo al inicio
if (state.token) {
  // Podríamos pedir /auth/perfil, pero no es crítico para la demo
}