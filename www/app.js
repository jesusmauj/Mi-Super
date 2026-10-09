(() => {
  "use strict";

  /* ---------- Estado ---------- */
  const KEY = "misuper.v1";
  const CURRENCIES = { COP: "es-CO", USD: "en-US", MXN: "es-MX", EUR: "es-ES", ARS: "es-AR", PEN: "es-PE", CLP: "es-CL" };

  // prices: { "<departamento>": { "<nombre normalizado>": { name, unit, price, at } } }
  const defaults = { budget: 0, currency: "COP", region: "", town: "", prices: {}, custom: [], list: [] };
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const s = Object.assign({}, defaults, raw ? JSON.parse(raw) : {});
      if (!s.prices || typeof s.prices !== "object") s.prices = {};
      return s;
    } catch (e) {
      return Object.assign({}, defaults, { prices: {} });
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function money(n) {
    const locale = CURRENCIES[state.currency] || "es-CO";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency", currency: state.currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(n);
    } catch (e) {
      return "$" + Math.round(n);
    }
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 1600);
  }

  const total = () => state.list.reduce((s, i) => s + i.price * i.qty, 0);

  function status() {
    const spent = total();
    const left = state.budget - spent;
    const pct = state.budget > 0 ? spent / state.budget : 0;
    return { spent, left, pct, level: left < 0 ? "over" : pct >= 0.8 ? "warn" : "ok" };
  }

  /* ---------- Precios que la app recuerda ---------- */
  function placePrices() {
    if (!state.prices[state.region]) state.prices[state.region] = {};
    return state.prices[state.region];
  }

  const knownPrice = (name) => placePrices()[norm(name)] || null;

  function rememberPrice(name, unit, price) {
    placePrices()[norm(name)] = { name, unit, price, at: Date.now() };
    save();
  }

  function forgetPrice(name) {
    delete placePrices()[norm(name)];
    save();
  }

  // Catálogo base + productos propios, con el precio recordado (si lo hay).
  function catalog() {
    return window.CATALOG.concat(state.custom).map((p) => {
      const k = knownPrice(p.name);
      return Object.assign({}, p, { price: k ? k.price : null });
    });
  }

  /* ---------- Pantalla principal ---------- */
  function renderSummary() {
    const box = $("summary");
    box.replaceChildren();
    box.className = "summary";

    if (!state.budget) {
      box.classList.add("setup");
      box.append(
        h("div", { class: "big" }, "Define tu presupuesto"),
        h("p", null, "Elige cuánto quieres gastar y verás en vivo cuánto te queda."),
        h("button", { class: "btn", onclick: openBudget }, "Establecer presupuesto")
      );
      return;
    }

    const s = status();
    box.classList.add(s.level);
    box.append(
      h("div", { class: "label" }, s.left < 0 ? "Te pasaste por" : "Te quedan"),
      h("div", { class: "big" }, money(Math.abs(s.left))),
      h("div", { class: "bar" }, h("i", { style: "width:" + Math.min(100, s.pct * 100) + "%" })),
      h("div", { class: "stats" },
        h("button", { class: "stat tap", onclick: openBudget },
          h("div", { class: "label" }, "Presupuesto"), h("div", { class: "v" }, money(state.budget))),
        h("div", { class: "stat" },
          h("div", { class: "label" }, "En tu lista"), h("div", { class: "v" }, money(s.spent)))
      )
    );
  }

  function renderList() {
    const box = $("list");
    box.replaceChildren();
    if (!state.list.length) {
      box.append(h("div", { class: "empty" }, "Tu lista está vacía. Toca «Agregar producto» para empezar."));
      return;
    }
    for (const it of state.list) {
      box.append(
        h("div", { class: "item" + (it.done ? " done" : "") },
          h("button", { class: "check", "aria-label": "Marcar como comprado", onclick: () => toggle(it.id) },
            h("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "3.2", "stroke-linecap": "round", "stroke-linejoin": "round" },
              h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))),
          h("button", { class: "info", onclick: () => openEdit(it.id) },
            h("div", { class: "name" }, it.name),
            h("div", { class: "sub" }, money(it.price) + " / " + it.unit)),
          h("div", { class: "stepper" },
            h("button", { "aria-label": "Menos", onclick: () => changeQty(it.id, -1) }, "−"),
            h("span", null, it.qty),
            h("button", { "aria-label": "Más", onclick: () => changeQty(it.id, 1) }, "+")),
          h("div", { class: "total" }, money(it.price * it.qty))
        )
      );
    }
  }

  function renderLocation() {
    const btn = $("btn-loc");
    btn.replaceChildren();
    if (!state.region) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.append(state.town ? state.town + ", " + state.region : state.region);
  }

  function render() {
    renderLocation();
    renderSummary();
    renderList();
  }

  function toggle(id) {
    const it = state.list.find((i) => i.id === id);
    if (it) { it.done = !it.done; save(); render(); }
  }

  function changeQty(id, d) {
    const it = state.list.find((i) => i.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty < 1) state.list = state.list.filter((i) => i.id !== id);
    save();
    render();
  }

  function addToList(p, price) {
    const found = state.list.find((i) => i.cid === p.id && i.price === price);
    if (found) found.qty += 1;
    else state.list.push({ id: uid(), cid: p.id, name: p.name, unit: p.unit, price, qty: 1, done: false });
    save();
    render();
  }

  /* ---------- Hoja inferior ---------- */
  let sheetOpen = false;
  let usingHistory = false;

  function showSheet(node) {
    const sheet = $("sheet");
    sheet.replaceChildren(node);
    sheet.hidden = false;
    $("scrim").hidden = false;
    if (!sheetOpen) {
      sheetOpen = true;
      try { history.pushState({ sheet: 1 }, ""); usingHistory = true; } catch (e) { usingHistory = false; }
    }
  }

  function hideSheet() {
    sheetOpen = false;
    $("sheet").hidden = true;
    $("scrim").hidden = true;
  }

  function closeSheet() {
    if (!sheetOpen || !state.region) return; // la primera vez hay que elegir ubicación
    if (usingHistory) history.back();
    else hideSheet();
  }

  window.addEventListener("popstate", () => {
    hideSheet();
    if (!state.region) openRegion(true);
  });
  $("scrim").addEventListener("click", closeSheet);

  function field(label, input) {
    return h("label", { class: "field" }, h("span", null, label), input);
  }

  function parseNum(v) {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  const priceInput = (value) =>
    h("input", { type: "number", inputmode: "decimal", min: "0", placeholder: "Ej: 3500", value: value == null ? "" : value });

  function onEnter(input, fn) {
    input.addEventListener("keydown", (e) => e.key === "Enter" && fn());
  }

  /* Presupuesto */
  function openBudget() {
    const input = h("input", { type: "number", inputmode: "decimal", min: "0", placeholder: "Ej: 300000", value: state.budget || "" });
    const apply = () => {
      const n = parseNum(input.value);
      if (!(n > 0)) { toast("Escribe un monto mayor que 0"); return; }
      state.budget = n;
      save(); render(); closeSheet();
    };
    showSheet(h("div", null,
      h("h2", null, "Presupuesto"),
      h("div", { class: "hint" }, "¿Cuánto quieres gastar en esta compra?"),
      field("Monto (" + state.currency + ")", input),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: closeSheet }, "Cancelar"),
        h("button", { class: "btn", onclick: apply }, "Guardar"))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* Agregar producto */
  function openAdd(prefill) {
    const search = h("input", { type: "search", placeholder: "Buscar: arroz, leche, pollo…", autocomplete: "off", value: prefill || "" });
    const hint = h("div", { class: "hint" });
    const results = h("div", { class: "results" });

    function updateHint() {
      hint.className = "hint";
      if (!state.budget) { hint.textContent = "Sin presupuesto definido"; return; }
      const s = status();
      hint.textContent = s.left < 0 ? "Te pasaste por " + money(-s.left) : "Te quedan " + money(s.left);
      if (s.level !== "ok") hint.classList.add(s.level);
    }

    function pick(p) {
      if (p.price != null) {
        addToList(p, p.price);
        toast(p.name + " agregado");
        updateHint();
        drawResults();
      } else {
        openPricePrompt(p, () => openAdd(search.value));
      }
    }

    function drawResults() {
      const q = norm(search.value.trim());
      results.replaceChildren();
      const matches = catalog().filter((p) => !q || norm(p.name).includes(q) || norm(p.cat).includes(q));
      let lastCat = null;
      for (const p of matches) {
        if (p.cat !== lastCat) { results.append(h("div", { class: "cat" }, p.cat)); lastCat = p.cat; }
        const inList = state.list.filter((i) => i.cid === p.id).reduce((s, i) => s + i.qty, 0);
        results.append(
          h("button", { class: "row", onclick: () => pick(p) },
            h("div", null,
              h("span", { class: "n" }, p.name),
              inList ? h("span", { class: "added" }, "× " + inList) : null,
              h("div", { class: "u" }, p.unit)),
            p.price != null
              ? h("div", { class: "p" }, money(p.price))
              : h("div", { class: "p none" }, "Poner precio"))
        );
      }
      const typed = search.value.trim();
      if (typed && !matches.some((p) => norm(p.name) === q)) {
        results.append(
          h("button", { class: "row", onclick: () => openCreate(typed, "add") },
            h("div", null, h("span", { class: "n" }, "Crear «" + typed + "»"), h("div", { class: "u" }, "Producto que no está en el catálogo")),
            h("div", { class: "p" }, "+ Nuevo"))
        );
      }
      if (!matches.length && !typed) results.append(h("div", { class: "empty" }, "El catálogo está vacío."));
    }

    search.addEventListener("input", drawResults);
    showSheet(h("div", { style: "display:flex;flex-direction:column;min-height:0;height:78vh" },
      h("h2", null, "Agregar producto"),
      hint,
      h("div", { class: "field search" }, search),
      results,
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: closeSheet }, "Listo"))
    ));
    updateHint();
    drawResults();
  }

  /* Primera vez con este producto: pedir el precio y recordarlo */
  function openPricePrompt(p, back) {
    const input = priceInput();
    const apply = () => {
      const price = parseNum(input.value);
      if (!(price >= 0) || input.value === "") { toast("Escribe el precio"); return; }
      rememberPrice(p.name, p.unit, price);
      addToList(p, price);
      toast(p.name + " agregado");
      back();
    };
    showSheet(h("div", null,
      h("h2", null, "¿A cuánto está " + p.name.toLowerCase() + "?"),
      h("div", { class: "hint" }, "Precio por " + p.unit + ". Lo recordaremos para no volver a pedirlo."),
      field("Precio (" + state.currency + ")", input),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: back }, "Volver"),
        h("button", { class: "btn", onclick: apply }, "Guardar y agregar"))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* Producto nuevo. mode "add": lo agrega a la lista; mode "price": solo registra el precio */
  function openCreate(name, mode) {
    const nameIn = h("input", { type: "text", value: name || "" });
    const priceIn = priceInput();
    const unitIn = h("input", { type: "text", value: "unidad" });
    const back = () => (mode === "add" ? openAdd(name) : openPrices());
    const create = () => {
      const n = nameIn.value.trim();
      const price = parseNum(priceIn.value);
      if (!n) { toast("Escribe un nombre"); return; }
      if (!(price >= 0) || priceIn.value === "") { toast("Escribe un precio"); return; }
      const unit = unitIn.value.trim() || "unidad";
      let p = window.CATALOG.concat(state.custom).find((x) => norm(x.name) === norm(n));
      if (!p) {
        p = { id: "u" + uid(), name: n, cat: "Mis productos", unit };
        state.custom.push(p);
      }
      rememberPrice(p.name, p.unit, price);
      if (mode === "add") {
        addToList(p, price);
        toast(n + " agregado");
        openAdd();
      } else {
        save();
        toast("Precio de " + n + " guardado");
        openPrices();
      }
    };
    showSheet(h("div", null,
      h("h2", null, "Producto nuevo"),
      h("div", { class: "hint" }, "Se guarda con su precio para la próxima vez."),
      field("Nombre", nameIn),
      h("div", { class: "two" }, field("Precio", priceIn), field("Unidad", unitIn)),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: back }, "Volver"),
        h("button", { class: "btn", onclick: create }, mode === "add" ? "Crear y agregar" : "Guardar"))
    ));
    setTimeout(() => (name ? priceIn : nameIn).focus(), 50);
  }

  /* Editar renglón de la lista (y actualizar el precio recordado) */
  function openEdit(id) {
    const it = state.list.find((i) => i.id === id);
    if (!it) return;
    const priceIn = priceInput(it.price);
    const qtyIn = h("input", { type: "number", inputmode: "numeric", min: "1", step: "1", value: it.qty });
    const apply = () => {
      const price = parseNum(priceIn.value);
      const qty = Math.floor(parseNum(qtyIn.value));
      if (!(price >= 0) || priceIn.value === "" || !(qty >= 1)) { toast("Revisa el precio y la cantidad"); return; }
      const k = knownPrice(it.name);
      if (!k || k.price !== price) rememberPrice(it.name, it.unit, price);
      it.price = price; it.qty = qty;
      save(); render(); closeSheet();
    };
    showSheet(h("div", null,
      h("h2", null, it.name),
      h("div", { class: "hint" }, "Si cambias el precio, la app lo recordará para la próxima vez."),
      h("div", { class: "two" }, field("Precio (" + it.unit + ")", priceIn), field("Cantidad", qtyIn)),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => { state.list = state.list.filter((i) => i.id !== id); save(); render(); closeSheet(); } }, "Quitar"),
        h("button", { class: "btn", onclick: apply }, "Guardar"))
    ));
  }

  /* Mis precios: todo lo que el usuario ha registrado en este lugar */
  function openPrices() {
    const search = h("input", { type: "search", placeholder: "Buscar en mis precios", autocomplete: "off" });
    const hint = h("div", { class: "hint" });
    const results = h("div", { class: "results" });

    function draw() {
      const q = norm(search.value.trim());
      const all = Object.entries(placePrices()).map(([key, v]) => Object.assign({ key }, v));
      all.sort((a, b) => a.name.localeCompare(b.name, "es"));
      const shown = all.filter((e) => !q || norm(e.name).includes(q));
      hint.textContent = all.length === 1 ? "1 producto registrado" : all.length + " productos registrados";
      results.replaceChildren();
      if (!all.length) {
        results.append(h("div", { class: "empty" }, "Aún no has registrado precios. Se guardan solos cuando agregas un producto."));
        return;
      }
      if (!shown.length) results.append(h("div", { class: "empty" }, "Nada coincide con tu búsqueda."));
      for (const e of shown) {
        const when = new Date(e.at).toLocaleDateString("es", { day: "numeric", month: "short" });
        results.append(
          h("button", { class: "row", onclick: () => openPriceEdit(e) },
            h("div", null, h("span", { class: "n" }, e.name), h("div", { class: "u" }, e.unit + " · actualizado " + when)),
            h("div", { class: "p" }, money(e.price)))
        );
      }
    }

    search.addEventListener("input", draw);
    showSheet(h("div", { style: "display:flex;flex-direction:column;min-height:0;height:78vh" },
      h("h2", null, "Mis precios"),
      hint,
      h("div", { class: "field search" }, search),
      results,
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: () => openCreate("", "price") }, "Nuevo precio"),
        h("button", { class: "btn", onclick: closeSheet }, "Listo"))
    ));
    draw();
  }

  function openPriceEdit(e) {
    const input = priceInput(e.price);
    const apply = () => {
      const price = parseNum(input.value);
      if (!(price >= 0) || input.value === "") { toast("Escribe el precio"); return; }
      rememberPrice(e.name, e.unit, price);
      toast("Precio actualizado");
      openPrices();
    };
    showSheet(h("div", null,
      h("h2", null, e.name),
      h("div", { class: "hint" }, "Precio por " + e.unit + ". Lo que ya está en tu lista no cambia."),
      field("Precio (" + state.currency + ")", input),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => { forgetPrice(e.name); toast("Precio olvidado"); openPrices(); } }, "Olvidar"),
        h("button", { class: "btn ghost", onclick: openPrices }, "Volver"),
        h("button", { class: "btn", onclick: apply }, "Guardar"))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* Ajustes */
  function openSettings() {
    const cur = h("select", null, Object.keys(CURRENCIES).map((c) => h("option", { value: c, selected: c === state.currency }, c)));
    const where = state.town ? state.town + ", " + state.region : state.region;
    const saveSettings = () => {
      state.currency = cur.value;
      save(); render(); closeSheet();
    };

    showSheet(h("div", null,
      h("h2", null, "Ajustes"),
      field("Moneda", cur),
      h("div", { class: "field" },
        h("span", null, "Ubicación"),
        h("button", { class: "btn ghost block", onclick: () => openRegion(false) }, where)),
      h("div", { class: "hint" }, "Tus precios se guardan para este lugar."),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => {
          if (!state.list.length) { toast("La lista ya está vacía"); return; }
          if (confirm("¿Vaciar toda la lista?")) { state.list = []; save(); render(); closeSheet(); }
        } }, "Vaciar lista"),
        h("button", { class: "btn", onclick: saveSettings }, "Guardar"))
    ));
  }

  /* Ubicación (la primera vez es obligatoria) */
  function openRegion(first) {
    const sel = h("select", null,
      h("option", { value: "", disabled: true, selected: !state.region }, "Elige tu departamento"),
      window.REGIONS.map((r) => h("option", { value: r, selected: r === state.region }, r)));
    const town = h("input", { type: "text", placeholder: "Ej: Chinchiná", value: state.town, autocomplete: "off" });

    const apply = () => {
      if (!sel.value) { toast("Elige un departamento"); return; }
      const changed = sel.value !== state.region;
      state.region = sel.value;
      state.town = town.value.trim();
      save(); render(); closeSheet();
      if (changed && !first) toast("Ahora usas tus precios de " + state.region);
    };

    showSheet(h("div", null,
      h("h2", null, first ? "¿Dónde compras?" : "Tu ubicación"),
      h("div", { class: "hint" }, "Tus precios se guardan por departamento, porque cambian de un lugar a otro."),
      field("Departamento", sel),
      field("Pueblo o municipio (opcional)", town),
      h("div", { class: "actions" },
        first ? null : h("button", { class: "btn ghost", onclick: closeSheet }, "Cancelar"),
        h("button", { class: "btn", onclick: apply }, first ? "Continuar" : "Guardar"))
    ));
  }

  /* ---------- Inicio ---------- */
  $("btn-add").addEventListener("click", () => openAdd());
  $("btn-prices").addEventListener("click", openPrices);
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-loc").addEventListener("click", () => openRegion(false));
  render();
  if (!state.region) openRegion(true);
})();
