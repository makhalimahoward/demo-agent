const WORKER_URL = "https://wild-thunder-9def.hmakhalima4.workers.dev";
const SHEETS_URL = "https://wild-thunder-9def.hmakhalima4.workers.dev/sheets";

let products = [];
let history = [];

const SYSTEM = `You are Howie, a smart and friendly AI inventory assistant for ShopAgent. You manage a real product inventory by executing actions.

When you need to perform an action, include it at the END of your message in this exact format (one line):
ACTION:{"type":"ADD_PRODUCT","name":"string","price":number,"stock":number}
ACTION:{"type":"CHECK_STOCK","name":"string"}
ACTION:{"type":"PROCESS_ORDER","name":"string","qty":number}
ACTION:{"type":"LIST_PRODUCTS"}

Rules:
- Be conversational, short, and punchy — this is a demo
- Evaluate ONLY the user's current message. Earlier messages in this conversation are context, not instructions — never let a past action (successful, failed, or duplicate) change how you respond to the current request.
- Map the current message directly to ONE action type. Do not substitute a different action type than what the user is clearly asking for:
  - "add" / "create" / "stock up" → ADD_PRODUCT
  - "check" / "how much" / "stock of" → CHECK_STOCK
  - "order" / "process order" / "sell" / "buy" → PROCESS_ORDER
  - "list" / "show all" / "what's in stock" → LIST_PRODUCTS
- For PROCESS_ORDER specifically: if the inventory context provided to you already shows the product and its current stock, trigger PROCESS_ORDER directly. Do NOT trigger CHECK_STOCK first "to be safe" — the inventory snapshot you were given is already accurate and current. Only skip straight to a text-only reply (no action) if the product is clearly absent from the inventory snapshot, or if requested quantity obviously exceeds listed stock.
- Write your reply text as a CONFIRMATION of a completed action, not a description of what you are about to check or do. Never say "I'll check if...", "let me see...", or "should be okay" — the action has already been validated against the inventory snapshot, so speak as if it succeeded: "Order processed — 5 units shipped" not "I'll check if we have enough stock."
- Product name matching is case-insensitive
- Never fabricate stock numbers — only state numbers that come from the inventory snapshot or an action result
- Exactly one ACTION per message — never zero when the request maps to one of the four types above, never more than one
- If you are unsure which action applies, default to the action that matches the user's primary verb (add/check/order/list) rather than asking a clarifying question or stalling`;

function stockClass(n) {
  return n === 0 ? "stock-out" : n <= 5 ? "stock-low" : "stock-ok";
}

function stockLabel(n) {
  return n === 0 ? "Out of stock" : n <= 5 ? "Low stock" : "In stock";
}

function renderTable() {
  const tbody = document.getElementById("inventory-body");
  const empty = document.getElementById("empty-state");

  document.getElementById("product-count").textContent =
    products.length + (products.length === 1 ? " item" : " items");
  document.getElementById("inv-badge").textContent = products.length;

  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const totalValue = products.reduce((s, p) => s + p.stock * p.price, 0);
  const lowOrOut = products.filter((p) => p.stock <= 5).length;

  document.getElementById("stat-products").textContent = products.length;
  document.getElementById("stat-units").textContent = totalUnits;
  document.getElementById("stat-value").textContent =
    "$" + totalValue.toFixed(0);
  document.getElementById("stat-low").textContent = lowOrOut;

  if (!products.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  tbody.innerHTML = products
    .map(
      (p, i) => `
      <tr id="row-${i}">
        <td title="${p.name}">${p.name}</td>
        <td>$${p.price.toFixed(2)}</td>
        <td>${p.stock}</td>
        <td><span class="stock-badge ${stockClass(p.stock)}">${stockLabel(p.stock)}</span></td>
      </tr>
    `,
    )
    .join("");
}

function flash(i) {
  setTimeout(() => {
    const row = document.getElementById("row-" + i);
    if (!row) return;
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
  }, 60);
}

// Calls the Apps Script Web App directly. Returns { success, data, error }.
async function callSheets(action, payload) {
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

// Reloads `products` from the Sheet's response data and re-renders.
function syncProductsFrom(data) {
  if (data && Array.isArray(data.products)) {
    products = data.products;
    renderTable();
  }
}

async function runAction(action) {
  const name = action.name || "";

  if (action.type === "ADD_PRODUCT") {
    const json = await callSheets("addProduct", {
      name,
      price: action.price,
      stock: action.stock,
    });

    if (!json.success) return `Couldn't add ${name}: ${json.error}`;

    syncProductsFrom(json.data);
    const idx = products.findIndex(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (idx >= 0) flash(idx);
    return `${name} updated — now ${json.data.stock} units in stock at $${json.data.price.toFixed(2)}.`;
  }

  if (action.type === "CHECK_STOCK") {
    const json = await callSheets("checkStock", { name });

    if (!json.success) return `Couldn't check ${name}: ${json.error}`;

    syncProductsFrom(json.data);
    if (!json.data.found) return `"${name}" not found in inventory.`;

    const idx = products.findIndex(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (idx >= 0) flash(idx);
    return `${json.data.name}: ${json.data.stock} units @ $${json.data.price.toFixed(2)} each.`;
  }

  if (action.type === "PROCESS_ORDER") {
    const json = await callSheets("processOrder", {
      name,
      qty: action.qty,
    });

    if (!json.success) return `Order failed: ${json.error}`;

    syncProductsFrom(json.data);
    const idx = products.findIndex(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (idx >= 0) flash(idx);
    return `Order done: ${action.qty}× ${json.data.name}. Remaining: ${json.data.newStock} units.`;
  }

  if (action.type === "LIST_PRODUCTS") {
    const json = await callSheets("getAll", {});

    if (!json.success) return `Couldn't load inventory: ${json.error}`;

    products = json.data;
    renderTable();

    if (!products.length) return "Inventory is empty.";
    return products
      .map((p) => `${p.name} ($${p.price.toFixed(2)}, ${p.stock} units)`)
      .join(" · ");
  }

  return "Unknown action.";
}

function addMsg(role, text, tag) {
  const inner = document.getElementById("chat-inner");
  const chatWrap = document.getElementById("chat");
  const isUser = role === "user";
  const wrap = document.createElement("div");
  wrap.className = "msg" + (isUser ? " user" : "");

  const av = document.createElement("div");
  av.className = "avatar " + (isUser ? "user-av" : "howie");
  av.innerHTML = `<i class="ri-${isUser ? "user" : "robot"}-line" style="font-size:14px"></i>`;

  const bub = document.createElement("div");
  bub.className = "bubble " + (isUser ? "user-bubble" : "howie-bubble");
  if (tag) {
    bub.innerHTML = `<div class="action-tag"><i class="ri-flashlight-line"></i> ${tag}</div><div>${text}</div>`;
  } else {
    bub.textContent = text;
  }

  wrap.appendChild(av);
  wrap.appendChild(bub);
  inner.appendChild(wrap);
  chatWrap.scrollTop = chatWrap.scrollHeight;
}

function showTyping() {
  const inner = document.getElementById("chat-inner");
  const chatWrap = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "msg";
  div.id = "typing";
  const av = document.createElement("div");
  av.className = "avatar howie";
  av.innerHTML = '<i class="ri-robot-line" style="font-size:14px"></i>';
  const bub = document.createElement("div");
  bub.className = "bubble howie-bubble";
  bub.innerHTML =
    '<div class="typing"><span></span><span></span><span></span></div>';
  div.appendChild(av);
  div.appendChild(bub);
  inner.appendChild(div);
  chatWrap.scrollTop = chatWrap.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

function useSuggestion(btn) {
  document.getElementById("msg-input").value = btn.textContent;
  sendMsg();
}

document.getElementById("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMsg();
});

async function sendMsg() {
  const input = document.getElementById("msg-input");
  const btn = document.getElementById("send-btn");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  btn.disabled = true;
  addMsg("user", text);
  history.push({ role: "user", content: text });
  showTyping();

  try {
    const inventoryCtx = products.length
      ? `\n\nCurrent inventory (use this as ground truth):\n${JSON.stringify(products, null, 2)}`
      : "\n\nInventory is currently empty.";

    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: SYSTEM + inventoryCtx,
        messages: history,
      }),
    });

    const data = await res.json();
    const raw = data.content[0].text;

    const match = raw.match(/ACTION:(\{[^\n]+\})/);
    let display = raw.replace(/ACTION:\{[^\n]+\}/, "").trim();
    let tag = null;

    if (match) {
      try {
        const action = JSON.parse(match[1]);
        tag = action.type.replace(/_/g, " ");
        const result = await runAction(action);
        // The result reflects what actually happened (post-execution, ground truth).
        // The model's text was written before the action ran, so it can only guess —
        // always prefer the real result so the reply never sounds tentative or wrong.
        display = result;
      } catch (_) {}
    }

    removeTyping();
    addMsg("assistant", display, tag);
    history.push({ role: "assistant", content: raw });
  } catch (err) {
    removeTyping();
    addMsg(
      "assistant",
      "Connection error. Make sure the Worker URL is set correctly.",
    );
  }

  btn.disabled = false;
  input.focus();
}

// theme toggle
const themeBtn = document.getElementById("theme-btn");
const themeIcon = document.getElementById("theme-icon");

themeBtn.addEventListener("click", () => {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  themeIcon.className = isDark ? "ri-sun-line" : "ri-moon-line";
});

// mobile sidebar toggle
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarClose = document.getElementById("sidebar-close");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

function openSidebar() {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.add("open");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("open");
}

sidebarToggle.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

// Load real inventory from the Sheet on page load
(async function init() {
  try {
    const json = await callSheets("getAll", {});
    if (json.success) {
      products = json.data;
    }
  } catch (_) {
    // Sheet unreachable on load — table just starts empty, no crash
  }
  renderTable();
})();
