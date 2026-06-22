const WORKER_URL = "YOUR_WORKER_URL_HERE";

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
- Always trigger an ACTION when the user asks to add, check, order, or list
- Product name matching is case-insensitive
- If processing an order and stock is insufficient, say so without an action
- Never fabricate stock numbers — always use CHECK_STOCK or LIST_PRODUCTS
- One ACTION per message maximum`;

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

function runAction(action) {
  const key = (action.name || "").toLowerCase();

  if (action.type === "ADD_PRODUCT") {
    const idx = products.findIndex((p) => p.name.toLowerCase() === key);
    if (idx >= 0) {
      products[idx].stock += action.stock;
      renderTable();
      flash(idx);
      return `Updated ${action.name}. New stock: ${products[idx].stock} units.`;
    }
    products.push({
      name: action.name,
      price: action.price,
      stock: action.stock,
    });
    renderTable();
    flash(products.length - 1);
    return `Added ${action.name} — $${action.price}, ${action.stock} units.`;
  }

  if (action.type === "CHECK_STOCK") {
    const p = products.find((p) => p.name.toLowerCase() === key);
    if (!p) return `"${action.name}" not found in inventory.`;
    flash(products.indexOf(p));
    return `${p.name}: ${p.stock} units @ $${p.price.toFixed(2)} each.`;
  }

  if (action.type === "PROCESS_ORDER") {
    const p = products.find((p) => p.name.toLowerCase() === key);
    if (!p) return `"${action.name}" not found.`;
    if (p.stock < action.qty)
      return `Not enough stock — only ${p.stock} units left.`;
    p.stock -= action.qty;
    const idx = products.indexOf(p);
    renderTable();
    flash(idx);
    return `Order done: ${action.qty}× ${p.name} = $${(action.qty * p.price).toFixed(2)}. Remaining: ${p.stock} units.`;
  }

  if (action.type === "LIST_PRODUCTS") {
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
        const result = runAction(action);
        if (!display) display = result;
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

renderTable();
