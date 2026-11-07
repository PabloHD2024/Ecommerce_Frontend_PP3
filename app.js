/* =========================================================
   TechStore — Frontend conectado al API Gateway real
   Gateway: https://pp3-ecommerce-api-gateway.onrender.com
   ========================================================= */

const API_BASE = "https://pp3-ecommerce-api-gateway.onrender.com"; 
const TOKEN_KEY = "techstore_token";

/* ---------- ESTADO ---------- */
let state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  cart: [],
  products: [],
  destacados: [],
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
  if(!t) return;
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
    throw new Error("No se pudo conectar al servidor.");
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
    const data = await api("/api/sesiones", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    
    state.token = data.token;
    state.user = data.usuario || data.user || {}; 
    
    localStorage.setItem(TOKEN_KEY, data.token);
    closeModal("modal-login");
    updateAuthUI();
    showView("perfil");
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = $("#reg-nombre").value.trim();
  const apellido = $("#reg-apellido") ? $("#reg-apellido").value.trim() : "";
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;
  
  try {
    // Enviamos nombre y apellido. Si el back no acepta apellido, lo ignorará.
    await api("/api/usuarios", {
      method: "POST",
      body: JSON.stringify({ nombre, apellido, email, password }),
    });
    toast("Cuenta creada. Ahora iniciá sesión.");
    closeModal("modal-register");
    $("#login-email").value = email;
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
  state.cart = []; // Vaciamos el carrito para el próximo usuario
  localStorage.removeItem(TOKEN_KEY);
  updateCartCount();
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
  { id: 1, nombre: "Notebook Pro 14", descripcion: "Intel i7 · 16GB RAM", precio: 1299.99, stock: 8, categoria: "laptops" },
  { id: 2, nombre: "Auriculares BT Pro", descripcion: "Cancelación de ruido", precio: 199.50, stock: 25, categoria: "audio" },
];

const EMOJIS = { laptops: "💻", audio: "🎧", accesorios: "🖱️", monitores: "🖥️", default: "📦" };
function emojiFor(p) { return EMOJIS[p.categoria] || EMOJIS.default; }

async function loadProducts() {
  const grid = $("#products-grid");
  grid.innerHTML = `<p class="empty-msg">Cargando productos...</p>`;
  
  const q = $("#search-input").value.trim();
  const cat = $("#category-select").value;

  const params = new URLSearchParams();
  if (cat) params.append("categoria", cat);
  if (q) params.append("nombre", q);

  try {
    const data = await api(`/api/productos?${params.toString()}`);
    state.cotizacion = data.cotizacion || null;
    state.products = (data.productos || []).map((p) => ({
      ...p,
      precio: Number(p.precio),
      stock: Number(p.stock),
    }));
  } catch (err) {
    console.warn("Usando mocks:", err.message);
    let mocks = [...MOCK_PRODUCTS];
    if (cat) mocks = mocks.filter(m => m.categoria === cat);
    if (q) mocks = mocks.filter(m => m.nombre.toLowerCase().includes(q.toLowerCase()));
    state.products = mocks;
    state.cotizacion = null; 
  }

  const cot = $("#cotizacion-info");
  if (state.cotizacion) {
    cot.textContent = `💵 Dólar: compra $${state.cotizacion.compra} · venta $${state.cotizacion.venta}`;
    cot.classList.remove("hidden");
  } else {
    cot.classList.add("hidden");
  }

  renderProducts(state.products);
}

async function loadCategories() {
  const select = $("#category-select");
  if (!select) return;

  try {
    const categorias = await api("/api/categorias");
    categorias.forEach(cat => {
      const valor = typeof cat === 'string' ? cat : cat.nombre || cat.categoria;
      const option = document.createElement("option");
      option.value = valor;
      option.textContent = valor;
      select.appendChild(option);
    });
  } catch (err) {
    console.warn("Fallo /api/categorias");
  }
}

async function loadDestacados() {
  const grid = document.getElementById("destacados-grid");
  if (!grid) return;

  grid.innerHTML = `<p class="empty-msg">Cargando productos destacados...</p>`;

  let productos = [];
  try {
    const data = await api("/api/productos");
    productos = (data.productos || []).slice(0, 4); 
    state.destacados = productos;
  } catch (err) {
    if (typeof MOCK_PRODUCTS !== "undefined") {
      productos = MOCK_PRODUCTS.slice(0, 4);
      state.destacados = productos;
    }
  }

  if (!productos.length) {
    grid.innerHTML = `<p class="empty-msg">No hay productos destacados.</p>`;
    return;
  }

  grid.innerHTML = productos.map((p) => {
    const imgUrl = p.imagen || p.imagen_url || p.foto || p.image || p.imagenUrl || null;
    const precio = Number(p.precio);
    const precioFmt = isNaN(precio) ? "—" : precio.toFixed(2);

    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${escapeHtml(p.nombre || "Producto")}" onerror="this.parentElement.innerHTML='<span class=\\'no-img\\'>📦</span>'">`
      : `<span class="no-img">📦</span>`;

    return `
      <div class="destacados-card">
        <div class="destacados-img-wrap">${imgHtml}</div>
        <div class="destacados-body">
          <h3 class="card-title">${escapeHtml(p.nombre || "Sin nombre")}</h3>
          <p class="descripcion-producto">${escapeHtml(p.descripcion || "Sin descripción.")}</p>
          <span class="precio">$${precioFmt}</span>
          <button class="btn-primary" onclick="addToCart('${p.id}')">Agregar al carrito</button>
        </div>
      </div>`;
  }).join("");
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
    const usd = p.precioUSD ? `<span class="price-usd">≈ USD ${Number(p.precioUSD).toFixed(2)}</span>` : "";

    const imgSrc = p.image || p.imagen || p.foto;
    const imgHtml = imgSrc 
      ? `<img src="${imgSrc}" alt="${p.nombre}" style="width: 100%; height: 100%; object-fit: contain;">` 
      : "📦";

    return `
    <div class="product-card">
      <div class="product-img">${imgHtml}</div>
      <div class="product-body">
        <h4>${p.nombre}</h4>
        <p class="desc">${p.descripcion || ""}</p>
        <span class="price">$${p.precio.toFixed(2)}</span>
        ${usd}
        <span class="stock ${stockClass}">${stockText}</span>
        <!-- IMPORTANTE: Pasamos el ID entre comillas simples para que no falle si es un string (UUID) -->
        <button class="btn-primary" ${sinStock ? "disabled" : ""} onclick="addToCart('${p.id}')">
          ${sinStock ? "Sin stock" : "Agregar al carrito"}
        </button>
      </div>
    </div>`;
  }).join("");
}

let searchTimeout;
$("#search-input").addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { loadProducts(); }, 400); 
});
$("#category-select").addEventListener("change", () => { loadProducts(); });

/* ---------- CARRITO ---------- */
function addToCart(id) {
  const prod = state.products.find((p) => String(p.id) === String(id)) || state.destacados.find((p) => String(p.id) === String(id));
  if (!prod) return toast("Error: Producto no encontrado", "error");

  const existing = state.cart.find((i) => String(i.id) === String(prod.id));
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
  const item = state.cart.find((i) => String(i.id) === String(id));
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter((i) => String(i.id) !== String(id));
  updateCartCount();
  renderCart();
}
window.changeQty = changeQty;

function removeItem(id) {
  state.cart = state.cart.filter((i) => String(i.id) !== String(id));
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
        <button class="qty-btn" onclick="changeQty('${i.id}', -1)">−</button>
        <span>${i.qty}</span>
        <button class="qty-btn" onclick="changeQty('${i.id}', 1)">+</button>
      </div>
      <strong class="subtotal">$${(i.precio * i.qty).toFixed(2)}</strong>
      <button class="remove" onclick="removeItem('${i.id}')" title="Quitar">🗑️</button>
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
  
  // CORREGIDO: Antes decía || state.user (sin !)
  if (!state.token || !state.user) {
    toast("Iniciá sesión para comprar", "error");
    $("#modal-login").classList.remove("hidden");
    return;
  }
  if (!state.cart.length) return toast("Tu carrito está vacío", "error");

  const direccion = $("#direccion").value.trim();
  if (!direccion) return toast("Ingresá una dirección", "error");

  // Enviamos el ID tal cual viene (como string para UUIDs de PostgreSQL)
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
    toast(`¡Pedido #${pedido.id || 'creado'} confirmado! 🎉`);
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
    const pedidos = await api("/api/pedidos");
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
      ${!cancelado ? `<button class="btn-cancelar" onclick="cancelOrder('${o.id}')">Cancelar pedido</button>` : ""}
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

  if (!state.token) return;

  try {
    const cliente = await api("/api/clientes/perfil");
    state.perfilCliente = cliente || {};
    
    $("#profile-dni").textContent = cliente.dni || "—";
    $("#profile-telefono").textContent = cliente.telefono || "—";
    
    const dirs = Array.isArray(cliente.direcciones) ? cliente.direcciones : [];
    $("#profile-direcciones").innerHTML = dirs.length
      ? dirs.map((d) => `<li>${d.calle || ""} ${d.numero || ""} — ${d.ciudad || ""} ${d.esPredeterminada ? "⭐" : ""}</li>`).join("")
      : "<li>Sin direcciones cargadas</li>";
      
    container.classList.add("hidden");
  } catch (err) {
    state.perfilCliente = null;
    $("#profile-dni").textContent = "—";
    $("#profile-telefono").textContent = "—";
    $("#profile-direcciones").innerHTML = "<li>Completá el formulario para crear tu perfil</li>";
    container.classList.remove("hidden"); 
  }
}

/* ---------- CREAR PERFIL DE CLIENTE (Usa la ruta real /api/clientes) ---------- */
$("#cliente-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const body = {
    nombre: $("#cl-nombre").value.trim(),
    apellido: $("#cl-apellido").value.trim(),
    dni: $("#cl-dni").value.trim(),
    email: state.user?.email || "sin-email@test.com",
    telefono: $("#cl-telefono").value.trim() || undefined,
    direccion: $("#cl-direccion").value.trim(),
  };

  try {
    // Usamos el endpoint original del ms-clientes que sabemos que funciona
    await api("/api/clientes", {
      method: "POST",
      body: JSON.stringify(body),
    });
    toast("Perfil creado con éxito ✅");
    loadProfile();
  } catch (err) {
    // Si el cliente ya existe, intentamos actualizarlo
    try {
      await api("/api/clientes/perfil", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      toast("Perfil actualizado ✅");
      loadProfile();
    } catch (err2) {
      toast(err2.message || err.message, "error");
    }
  }
});

/* ---------- INIT ---------- */
async function init() {
  updateCartCount();
  loadCategories();
  loadDestacados();

  const footerYear = document.getElementById("footer-year");
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  if (state.token) {
    try {
      const usuario = await api("/api/usuarios/me"); 
      state.user = usuario;
      updateAuthUI();
    } catch (err) {
      state.token = null;
      state.user = null;
      localStorage.removeItem(TOKEN_KEY);
      updateAuthUI();
    }
  } else {
    updateAuthUI();
  }
}

init();