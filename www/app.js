(() => {
  "use strict";

  /* ---------- Estado ---------- */
  const KEY = "misuper.v1";
  const CURRENCIES = { COP: "es-CO", USD: "en-US", MXN: "es-MX", EUR: "es-ES", ARS: "es-AR", PEN: "es-PE", CLP: "es-CL" };
  const LANGS = { es: "Español", en: "English" };

  // prices: { "<departamento>": { "<nombre normalizado>": { name, unit, price, at } } }
  // history: [{ id, at, total, count, items: [{ name, unit, qty, price }] }]
  const defaults = {
    lang: "", budget: 0, budgetWeek: 0, budgetMonth: 0, currency: "COP", region: "", town: "",
    prices: {}, custom: [], list: [], history: [],
  };
  let state = load();
  let view = "list";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const s = Object.assign({}, defaults, raw ? JSON.parse(raw) : {});
      if (!s.prices || typeof s.prices !== "object") s.prices = {};
      if (!Array.isArray(s.history)) s.history = [];
      if (!LANGS[s.lang]) s.lang = (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
      return s;
    } catch (e) {
      return Object.assign({}, defaults, { prices: {}, history: [], lang: "es" });
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }

  /* ---------- Idioma ---------- */
  function t(key, vars) {
    const pack = window.I18N[state.lang] || {};
    let s = pack[key] != null ? pack[key] : window.I18N.es[key] != null ? window.I18N.es[key] : key;
    if (vars && typeof s === "string") for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  const tr = (group, v) => (window.I18N[group][state.lang] && window.I18N[group][state.lang][v]) || v;
  const dn = (name) => tr("names", name); // nombre de producto
  const du = (unit) => tr("units", unit); // unidad
  const dc = (cat) => tr("cats", cat); // categoría
  const dateLocale = () => (state.lang === "en" ? "en-US" : "es-CO");

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

  const SVG_TAGS = new Set(["svg", "path", "circle"]);
  function h(tag, props, ...kids) {
    const el = SVG_TAGS.has(tag)
      ? document.createElementNS("http://www.w3.org/2000/svg", tag)
      : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function icon(size, ...paths) {
    return h("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round" },
      paths.map((d) => h("path", { d })));
  }

  const ICONS = {
    list: ["M9 6h11M9 12h11M9 18h11", "M4 6h.01M4 12h.01M4 18h.01"],
    spend: ["M4 20V10", "M10 20V4", "M16 20v-7", "M21 20H3"],
    products: ["M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z", "M7.5 7.5h.01"],
    tips: ["M9 18h6M10 21h4", "M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"],
    settings: ["M4 7h9M17 7h3M4 17h3M11 17h9", "M15 4v6M9 14v6"],
  };

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.hidden = true), 1600);
  }

  const total = () => state.list.reduce((s, i) => s + i.price * i.qty, 0);
  const round2 = (n) => Math.round(n * 100) / 100;
  const fmtQty = (n) => String(round2(n)).replace(".", state.lang === "en" ? "." : ",");

  /* Compartir con el menú del teléfono; si no existe, copiar; si tampoco, mostrar el texto */
  async function shareText(text) {
    const cap = window.Capacitor;
    const isCancel = (e) => e && (e.name === "AbortError" || /cancel/i.test(String(e.message || e)));
    try {
      if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Share) {
        await cap.Plugins.Share.share({ text });
        return;
      }
    } catch (e) { if (isCancel(e)) return; }
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch (e) { if (isCancel(e)) return; }
    try {
      await navigator.clipboard.writeText(text);
      toast(t("share.copied"));
      return;
    } catch (e) { /* sin portapapeles */ }
    openTextSheet(text);
  }

  function openTextSheet(text) {
    const area = h("textarea", { readonly: true, rows: "9" }, text);
    showSheet(h("div", null,
      h("h2", null, t("bk.text.title")),
      h("div", { class: "field" }, area),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: closeSheet }, t("done")),
        h("button", { class: "btn", onclick: () => {
          area.select();
          try { document.execCommand("copy"); toast(t("bk.copied")); } catch (e) { /* seleccionado para copiar a mano */ }
        } }, t("bk.copy")))
    ));
  }

  function level(spent, budget) {
    const left = budget - spent;
    const pct = budget > 0 ? spent / budget : 0;
    return { spent, left, pct, level: left < 0 ? "over" : pct >= 0.8 ? "warn" : "ok" };
  }
  const status = () => level(total(), state.budget);

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
  const matchesQuery = (p, q) => !q || norm(p.name).includes(q) || norm(dn(p.name)).includes(q) || norm(dc(p.cat)).includes(q);

  /* ---------- Gastos por periodo ---------- */
  function weekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes
    return d;
  }
  const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
  const spentSince = (from) => state.history.filter((p) => p.at >= from.getTime()).reduce((s, p) => s + p.total, 0);

  /* ---------- Navegación y render ---------- */
  const VIEWS = {};

  function applyStatic() {
    document.documentElement.lang = state.lang;
    $("btn-menu").setAttribute("aria-label", t("menu"));
    $("fab-label").textContent = t("add");
  }

  function renderLocation() {
    const btn = $("btn-loc");
    btn.replaceChildren();
    if (!state.region) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.append(state.town ? state.town + ", " + state.region : state.region);
  }

  function render() {
    applyStatic();
    renderLocation();
    $("btn-add").hidden = view !== "list";
    const root = $("view");
    root.replaceChildren();
    VIEWS[view](root);
  }

  function go(next) {
    view = next;
    closeOverlay();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Superposiciones: hoja inferior y menú lateral ---------- */
  let overlayOpen = false;
  let usingHistory = false;

  function pushOverlay() {
    $("scrim").hidden = false;
    if (!overlayOpen) {
      overlayOpen = true;
      try { history.pushState({ overlay: 1 }, ""); usingHistory = true; } catch (e) { usingHistory = false; }
    }
  }

  function showSheet(node) {
    $("drawer").hidden = true;
    const sheet = $("sheet");
    sheet.replaceChildren(node);
    sheet.hidden = false;
    pushOverlay();
  }

  let closing = false; // evita retroceder dos veces si se cierra dos veces seguidas

  function hideOverlay() {
    overlayOpen = false;
    closing = false;
    $("sheet").hidden = true;
    $("drawer").hidden = true;
    $("scrim").hidden = true;
  }

  function closeOverlay() {
    if (!overlayOpen || !state.region) return; // la primera vez hay que elegir ubicación
    if (usingHistory) {
      if (closing) return;
      closing = true;
      history.back();
    } else hideOverlay();
  }
  const closeSheet = closeOverlay;

  window.addEventListener("popstate", () => {
    hideOverlay();
    if (!state.region) openRegion();
  });
  $("scrim").addEventListener("click", closeOverlay);

  function openMenu() {
    const items = [["list", "nav.list"], ["spend", "nav.spend"], ["products", "nav.products"], ["tips", "nav.tips"], ["settings", "nav.settings"]];
    const drawer = $("drawer");
    drawer.replaceChildren(
      h("div", { class: "drawer-head" }, t("menu")),
      h("nav", null, items.map(([id, label]) =>
        h("button", { class: "menu-item" + (id === view ? " active" : ""), onclick: () => go(id) },
          icon(22, ...ICONS[id]), h("span", null, t(label)))))
    );
    $("sheet").hidden = true;
    drawer.hidden = false;
    pushOverlay();
  }

  /* ---------- Formularios ---------- */
  const field = (label, input) => h("label", { class: "field" }, h("span", null, label), input);

  function parseNum(v) {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }
  const priceInput = (value) =>
    h("input", { type: "number", inputmode: "decimal", min: "0", placeholder: "3500", value: value == null ? "" : value });
  const onEnter = (input, fn) => input.addEventListener("keydown", (e) => e.key === "Enter" && fn());

  /* ================= VISTA: Mi lista ================= */
  VIEWS.list = (root) => {
    const summary = h("section", { class: "summary", "aria-live": "polite" });
    summary.append(...summaryNodes(summary));
    root.append(summary, listNode());
    if (state.list.length) {
      root.append(h("div", { class: "list-actions" },
        h("button", { class: "btn ghost", onclick: shareList }, t("share.btn")),
        h("button", { class: "btn ghost finish", onclick: openFinish }, t("list.finish"))));
    }
  };

  function shareList() {
    const lines = state.list.map((i) => "• " + dn(i.name) + " × " + fmtQty(i.qty) + " — " + money(i.price * i.qty));
    shareText([t("share.title") + " (Mi Súper)", ...lines, "", t("share.total") + ": " + money(total())].join("\n"));
  }

  function summaryNodes(box) {
    if (!state.budget) {
      box.classList.add("setup");
      return [
        h("div", { class: "big" }, t("setup.title")),
        h("p", null, t("setup.text")),
        h("button", { class: "btn", onclick: () => openBudget("trip") }, t("setup.btn")),
      ];
    }
    const s = status();
    box.classList.add(s.level);
    return [
      h("div", { class: "label" }, s.left < 0 ? t("over") : t("left")),
      h("div", { class: "big" }, money(Math.abs(s.left))),
      h("div", { class: "bar" }, h("i", { style: "width:" + Math.min(100, s.pct * 100) + "%" })),
      h("div", { class: "stats" },
        h("button", { class: "stat tap", onclick: () => openBudget("trip") },
          h("div", { class: "label" }, t("budget")), h("div", { class: "v" }, money(state.budget))),
        h("div", { class: "stat" },
          h("div", { class: "label" }, t("inlist")), h("div", { class: "v" }, money(s.spent))))
    ];
  }

  function listNode() {
    const box = h("section", { class: "list" });
    if (!state.list.length) {
      box.append(h("div", { class: "empty" }, t("list.empty")));
      return box;
    }
    for (const it of state.list) {
      box.append(
        h("div", { class: "item" + (it.done ? " done" : "") },
          h("button", { class: "check", "aria-label": "✓", onclick: () => toggle(it.id) },
            icon(14, "M5 12.5l4.5 4.5L19 7.5")),
          h("button", { class: "info", onclick: () => openEdit(it.id) },
            h("div", { class: "name" }, dn(it.name)),
            h("div", { class: "sub" }, money(it.price) + " / " + du(it.unit))),
          h("div", { class: "stepper" },
            h("button", { "aria-label": "−", onclick: () => changeQty(it.id, -1) }, "−"),
            h("span", null, fmtQty(it.qty)),
            h("button", { "aria-label": "+", onclick: () => changeQty(it.id, 1) }, "+")),
          h("div", { class: "total" }, money(it.price * it.qty)))
      );
    }
    return box;
  }

  function toggle(id) {
    const it = state.list.find((i) => i.id === id);
    if (it) { it.done = !it.done; save(); render(); }
  }

  function changeQty(id, d) {
    const it = state.list.find((i) => i.id === id);
    if (!it) return;
    it.qty = round2(it.qty + d);
    if (it.qty <= 0) state.list = state.list.filter((i) => i.id !== id);
    save();
    render();
  }

  function addToList(p, price) {
    const found = state.list.find((i) => i.cid === p.id && i.price === price);
    if (found) found.qty = round2(found.qty + 1);
    else state.list.push({ id: uid(), cid: p.id, name: p.name, unit: p.unit, price, qty: 1, done: false });
    save();
    render();
  }

  /* Presupuestos: de la compra, semanal o mensual */
  function openBudget(kind) {
    const field_ = { trip: "budget", week: "budgetWeek", month: "budgetMonth" }[kind];
    const title = { trip: "budget.title", week: "budget.week.title", month: "budget.month.title" }[kind];
    const hint = { trip: "budget.trip", week: "budget.week", month: "budget.month" }[kind];
    const input = h("input", { type: "number", inputmode: "decimal", min: "0", placeholder: "300000", value: state[field_] || "" });
    const apply = () => {
      const empty = input.value.trim() === "";
      const n = empty ? 0 : parseNum(input.value);
      if (!(n >= 0) || (kind === "trip" && !(n > 0))) { toast(t("err.amount")); return; }
      state[field_] = n;
      save(); render(); closeSheet();
    };
    showSheet(h("div", null,
      h("h2", null, t(title)),
      h("div", { class: "hint" }, t(hint) + (kind === "trip" ? "" : " " + t("budget.clear"))),
      field(t("amount", { cur: state.currency }), input),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: closeSheet }, t("cancel")),
        h("button", { class: "btn", onclick: apply }, t("save")))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* Terminar compra: pasa los productos al historial de gastos */
  function openFinish() {
    const checked = state.list.filter((i) => i.done);
    const items = checked.length ? checked : state.list;
    const sum = items.reduce((s, i) => s + i.price * i.qty, 0);
    const apply = () => {
      state.history.unshift({
        id: uid(), at: Date.now(), total: sum, count: items.length,
        items: items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, price: i.price })),
      });
      const ids = new Set(items.map((i) => i.id));
      state.list = state.list.filter((i) => !ids.has(i.id));
      save(); render(); closeSheet();
      toast(t("finish.toast"));
    };
    showSheet(h("div", null,
      h("h2", null, t("finish.title")),
      h("div", { class: "hint" }, t("finish.text", { n: items.length, total: money(sum) }) +
        (checked.length && checked.length < state.list.length ? " " + t("finish.rest") : "")),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: closeSheet }, t("cancel")),
        h("button", { class: "btn", onclick: apply }, t("finish.btn")))
    ));
  }

  /* Agregar producto a la lista */
  function openAdd(prefill) {
    const search = h("input", { type: "search", placeholder: t("add.search"), autocomplete: "off", value: prefill || "" });
    const hint = h("div", { class: "hint" });
    const results = h("div", { class: "results" });

    function updateHint() {
      hint.className = "hint";
      if (!state.budget) { hint.textContent = t("add.nobudget"); return; }
      const s = status();
      hint.textContent = (s.left < 0 ? t("over") : t("left")) + " " + money(Math.abs(s.left));
      if (s.level !== "ok") hint.classList.add(s.level);
    }

    function pick(p) {
      if (p.price != null) {
        addToList(p, p.price);
        toast(t("add.added", { name: dn(p.name) }));
        updateHint();
        drawResults();
      } else {
        openPricePrompt(p, () => openAdd(search.value));
      }
    }

    function drawResults() {
      const q = norm(search.value.trim());
      results.replaceChildren();
      const matches = catalog().filter((p) => matchesQuery(p, q));
      let lastCat = null;
      for (const p of matches) {
        if (p.cat !== lastCat) { results.append(h("div", { class: "cat" }, dc(p.cat))); lastCat = p.cat; }
        const inList = state.list.filter((i) => i.cid === p.id).reduce((s, i) => s + i.qty, 0);
        results.append(
          h("button", { class: "row", onclick: () => pick(p) },
            h("div", null,
              h("span", { class: "n" }, dn(p.name)),
              inList ? h("span", { class: "added" }, "× " + inList) : null,
              h("div", { class: "u" }, du(p.unit))),
            p.price != null
              ? h("div", { class: "p" }, money(p.price))
              : h("div", { class: "p none" }, t("add.setprice")))
        );
      }
      const typed = search.value.trim();
      if (typed && !matches.some((p) => norm(dn(p.name)) === q || norm(p.name) === q)) {
        results.append(
          h("button", { class: "row", onclick: () => openCreate(typed, "add") },
            h("div", null, h("span", { class: "n" }, t("add.create", { name: typed })), h("div", { class: "u" }, t("add.createhint"))),
            h("div", { class: "p" }, t("add.new")))
        );
      }
      if (!matches.length && !typed) results.append(h("div", { class: "empty" }, t("add.empty")));
    }

    search.addEventListener("input", drawResults);
    showSheet(h("div", { class: "tall" },
      h("h2", null, t("add.title")),
      hint,
      h("div", { class: "field search" }, search),
      results,
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: closeSheet }, t("done")))
    ));
    updateHint();
    drawResults();
  }

  /* Primera vez con este producto: pedir el precio y recordarlo */
  function openPricePrompt(p, back) {
    const input = priceInput();
    const apply = () => {
      const price = parseNum(input.value);
      if (!(price >= 0) || input.value === "") { toast(t("err.price")); return; }
      rememberPrice(p.name, p.unit, price);
      addToList(p, price);
      toast(t("add.added", { name: dn(p.name) }));
      back();
    };
    showSheet(h("div", null,
      h("h2", null, t("prompt.title", { name: dn(p.name).toLowerCase() })),
      h("div", { class: "hint" }, t("prompt.hint", { unit: du(p.unit) })),
      field(t("price", { cur: state.currency }), input),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: back }, t("back")),
        h("button", { class: "btn", onclick: apply }, t("prompt.save")))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* Producto nuevo. mode "add": lo agrega a la lista; mode "price": solo registra el precio */
  function openCreate(name, mode) {
    const nameIn = h("input", { type: "text", value: name || "", placeholder: mode === "price" ? "Auyama" : "" });
    const priceIn = priceInput();
    const unitIn = h("input", { type: "text", value: "unidad" });
    const back = () => (mode === "add" ? openAdd(name) : closeSheet());
    const create = () => {
      const n = nameIn.value.trim();
      const price = parseNum(priceIn.value);
      if (!n) { toast(t("err.name")); return; }
      if (!(price >= 0) || priceIn.value === "") { toast(t("err.price")); return; }
      const unit = unitIn.value.trim() || "unidad";
      let p = window.CATALOG.concat(state.custom).find((x) => norm(x.name) === norm(n) || norm(dn(x.name)) === norm(n));
      if (!p) {
        p = { id: "u" + uid(), name: n, cat: "Mis productos", unit };
        state.custom.push(p);
      }
      rememberPrice(p.name, p.unit, price);
      if (mode === "add") {
        addToList(p, price);
        toast(t("add.added", { name: dn(n) }));
        openAdd();
      } else {
        save(); render(); closeSheet();
        toast(t("saved", { name: n }));
      }
    };
    showSheet(h("div", null,
      h("h2", null, t("new.title")),
      h("div", { class: "hint" }, t("new.hint")),
      field(t("name"), nameIn),
      h("div", { class: "two" }, field(t("price2"), priceIn), field(t("unit"), unitIn)),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: back }, mode === "add" ? t("back") : t("cancel")),
        h("button", { class: "btn", onclick: create }, mode === "add" ? t("new.addbtn") : t("save")))
    ));
    setTimeout(() => (name ? priceIn : nameIn).focus(), 50);
  }

  /* Editar renglón de la lista (y actualizar el precio recordado) */
  function openEdit(id) {
    const it = state.list.find((i) => i.id === id);
    if (!it) return;
    const priceIn = priceInput(it.price);
    const qtyIn = h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", value: it.qty });
    const apply = () => {
      const price = parseNum(priceIn.value);
      const qty = round2(parseNum(qtyIn.value));
      if (!(price >= 0) || priceIn.value === "" || !(qty > 0)) { toast(t("err.check")); return; }
      const k = knownPrice(it.name);
      if (!k || k.price !== price) rememberPrice(it.name, it.unit, price);
      it.price = price; it.qty = qty;
      save(); render(); closeSheet();
    };
    showSheet(h("div", null,
      h("h2", null, dn(it.name)),
      h("div", { class: "hint" }, t("edit.hint")),
      h("div", { class: "two" }, field(t("price", { cur: du(it.unit) }), priceIn), field(t("qty"), qtyIn)),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => { state.list = state.list.filter((i) => i.id !== id); save(); render(); closeSheet(); } }, t("remove")),
        h("button", { class: "btn", onclick: apply }, t("save")))
    ));
  }

  /* ================= VISTA: Gastos ================= */
  VIEWS.spend = (root) => {
    root.append(h("h2", { class: "view-title" }, t("spend.title")));

    const loc = dateLocale();
    const ws = weekStart();
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString(loc, { day: "numeric", month: "short" });
    const monthLabel = new Date().toLocaleDateString(loc, { month: "long", year: "numeric" });

    root.append(
      periodCard(t("spend.week") + " · " + fmt(ws) + " – " + fmt(we), spentSince(ws), state.budgetWeek, "week"),
      periodCard(t("spend.month") + " · " + monthLabel, spentSince(monthStart()), state.budgetMonth, "month")
    );

    if (state.list.length) root.append(h("div", { class: "note" }, t("spend.inlist", { total: money(total()) })));

    root.append(h("div", { class: "section-title" }, t("spend.recent")));
    if (!state.history.length) {
      root.append(h("div", { class: "empty" }, t("spend.none")));
      return;
    }
    const box = h("div", { class: "card-list" });
    for (const p of state.history.slice(0, 20)) {
      const when = new Date(p.at).toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });
      box.append(
        h("button", { class: "row", onclick: () => openPurchase(p) },
          h("div", null, h("span", { class: "n" }, when),
            h("div", { class: "u" }, p.count === 1 ? t("spend.one") : t("spend.many", { n: p.count }))),
          h("div", { class: "p dark" }, money(p.total)))
      );
    }
    root.append(box);
  };

  function periodCard(label, spent, budget, kind) {
    const card = h("button", { class: "summary period", onclick: () => openBudget(kind) });
    card.append(h("div", { class: "label" }, label), h("div", { class: "big" }, money(spent)));
    if (budget > 0) {
      const s = level(spent, budget);
      card.classList.add(s.level);
      card.append(
        h("div", { class: "bar" }, h("i", { style: "width:" + Math.min(100, s.pct * 100) + "%" })),
        h("div", { class: "period-note" },
          t("spend.of", { total: money(budget) }) + " · " + (s.left < 0 ? t("over") : t("left")) + " " + money(Math.abs(s.left))));
    } else {
      card.classList.add("ok", "nobudget");
      card.append(h("div", { class: "period-note" }, t("spend.nobudget")));
    }
    return card;
  }

  function openPurchase(p) {
    const loc = dateLocale();
    const when = new Date(p.at).toLocaleString(loc, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    showSheet(h("div", null,
      h("h2", null, money(p.total)),
      h("div", { class: "hint" }, when),
      h("div", { class: "lines" }, p.items.map((i) =>
        h("div", { class: "line" },
          h("span", null, fmtQty(i.qty) + " × " + dn(i.name)),
          h("span", null, money(i.price * i.qty))))),
      h("button", { class: "btn ghost block again", onclick: () => buyAgain(p) }, t("buy.again")),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => {
          state.history = state.history.filter((x) => x.id !== p.id);
          save(); render(); closeSheet(); toast(t("purchase.deleted"));
        } }, t("purchase.delete")),
        h("button", { class: "btn", onclick: closeSheet }, t("done")))
    ));
  }

  /* Volver a comprar: pasa los productos de una compra a la lista, con el precio actual si se conoce */
  function buyAgain(p) {
    const all = window.CATALOG.concat(state.custom);
    for (const i of p.items) {
      const prod = all.find((x) => norm(x.name) === norm(i.name)) || { id: "h" + norm(i.name), name: i.name, unit: i.unit };
      const k = knownPrice(i.name);
      const price = k ? k.price : i.price;
      const found = state.list.find((x) => x.cid === prod.id && x.price === price);
      if (found) found.qty = round2(found.qty + i.qty);
      else state.list.push({ id: uid(), cid: prod.id, name: i.name, unit: i.unit, price, qty: i.qty, done: false });
    }
    save();
    go("list"); // también cierra la hoja
    toast(t("buy.added", { n: p.items.length }));
  }

  /* ================= VISTA: Mis productos ================= */
  VIEWS.products = (root) => {
    const search = h("input", { type: "search", placeholder: t("products.search"), autocomplete: "off" });
    const hint = h("div", { class: "hint" });
    const results = h("div", { class: "card-list" });

    function draw() {
      const q = norm(search.value.trim());
      const all = Object.entries(placePrices()).map(([key, v]) => Object.assign({ key }, v));
      all.sort((a, b) => dn(a.name).localeCompare(dn(b.name), state.lang));
      const shown = all.filter((e) => !q || norm(e.name).includes(q) || norm(dn(e.name)).includes(q));
      hint.textContent = all.length === 1 ? t("products.one") : t("products.many", { n: all.length });
      results.replaceChildren();
      if (!all.length) { results.append(h("div", { class: "empty" }, t("products.empty"))); return; }
      if (!shown.length) results.append(h("div", { class: "empty" }, t("products.nomatch")));
      for (const e of shown) {
        const when = new Date(e.at).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });
        results.append(
          h("button", { class: "row", onclick: () => openPriceEdit(e) },
            h("div", null, h("span", { class: "n" }, dn(e.name)),
              h("div", { class: "u" }, du(e.unit) + " · " + t("products.updated", { date: when }))),
            h("div", { class: "p" }, money(e.price)))
        );
      }
    }

    search.addEventListener("input", draw);
    root.append(
      h("h2", { class: "view-title" }, t("products.title")),
      hint,
      h("div", { class: "field search" }, search),
      results,
      h("div", { class: "add-more" },
        h("p", null, t("products.addhint")),
        h("button", { class: "btn block", onclick: () => openCreate("", "price") }, "+ " + t("products.addbtn")))
    );
    draw();
  };

  function openPriceEdit(e) {
    const input = priceInput(e.price);
    const apply = () => {
      const price = parseNum(input.value);
      if (!(price >= 0) || input.value === "") { toast(t("err.price")); return; }
      rememberPrice(e.name, e.unit, price);
      render(); closeSheet();
      toast(t("pe.updated"));
    };
    showSheet(h("div", null,
      h("h2", null, dn(e.name)),
      h("div", { class: "hint" }, t("pe.hint", { unit: du(e.unit) })),
      field(t("price", { cur: state.currency }), input),
      h("div", { class: "actions" },
        h("button", { class: "btn danger", onclick: () => { forgetPrice(e.name); render(); closeSheet(); toast(t("pe.forgot")); } }, t("forget")),
        h("button", { class: "btn", onclick: apply }, t("save")))
    ));
    onEnter(input, apply);
    setTimeout(() => input.focus(), 50);
  }

  /* ================= VISTA: Guía para ahorrar ================= */
  VIEWS.tips = (root) => {
    root.append(
      h("h2", { class: "view-title" }, t("tips.title")),
      h("p", { class: "intro" }, t("tips.intro"))
    );
    t("tips").forEach(([title, body], i) => {
      root.append(h("article", { class: "tip" },
        h("div", { class: "tip-n" }, i + 1),
        h("div", null, h("h3", null, title), h("p", null, body))));
    });
  };

  /* ================= VISTA: Ajustes ================= */
  VIEWS.settings = (root) => {
    const select = (options, value, onchange) =>
      h("select", { onchange: (e) => onchange(e.target.value) },
        options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)));

    const lang = select(Object.entries(LANGS), state.lang, (v) => { state.lang = v; save(); render(); });

    const region = select(window.REGIONS.map((r) => [r, r]), state.region, (v) => {
      state.region = v; save(); render(); toast(t("set.region.toast", { region: v }));
    });

    const town = h("input", { type: "text", placeholder: t("set.townph"), value: state.town, autocomplete: "off" });
    town.addEventListener("change", () => { state.town = town.value.trim(); save(); renderLocation(); });

    const cur = select(Object.keys(CURRENCIES).map((c) => [c, c]), state.currency, (v) => { state.currency = v; save(); render(); });

    root.append(
      h("h2", { class: "view-title" }, t("set.title")),
      h("div", { class: "card" },
        field(t("set.lang"), lang),
        field(t("set.region"), region),
        field(t("set.town"), town),
        h("div", { class: "hint" }, t("set.hint")),
        field(t("set.currency"), cur)),
      h("div", { class: "section-title" }, t("bk.title")),
      h("div", { class: "card backup" },
        h("div", { class: "hint" }, t("bk.hint")),
        h("button", { class: "btn ghost block", onclick: exportData }, t("bk.export")),
        h("button", { class: "btn ghost block", onclick: openImport }, t("bk.import"))),
      h("div", { class: "section-title" }, t("set.danger")),
      h("div", { class: "card danger-zone" },
        h("button", { class: "btn danger block", onclick: () => {
          if (!state.list.length) { toast(t("set.emptyalready")); return; }
          if (confirm(t("set.confirmlist"))) { state.list = []; save(); render(); toast(t("set.cleared")); }
        } }, t("set.clearlist")),
        h("button", { class: "btn danger block", onclick: () => {
          if (!state.history.length) { toast(t("set.emptyalready")); return; }
          if (confirm(t("set.confirmhist"))) { state.history = []; save(); render(); toast(t("set.cleared")); }
        } }, t("set.clearhist")))
    );
  };

  /* ---------- Copia de seguridad (texto JSON, sin archivos) ---------- */
  function exportData() {
    shareText(JSON.stringify({ app: "mi-super", version: 1, exported: new Date().toISOString(), data: state }));
  }

  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text.trim()); } catch (e) { return null; }
    const d = obj && obj.app === "mi-super" ? obj.data : null;
    if (!d || typeof d !== "object" || !Array.isArray(d.list) || !Array.isArray(d.history)
        || typeof d.prices !== "object" || d.prices === null || !Array.isArray(d.custom)) return null;
    const clean = Object.assign({}, defaults);
    for (const k of Object.keys(defaults)) if (d[k] !== undefined && typeof d[k] === typeof defaults[k]) clean[k] = d[k];
    clean.list = d.list; clean.history = d.history; clean.custom = d.custom; clean.prices = d.prices;
    if (!LANGS[clean.lang]) clean.lang = state.lang;
    return clean;
  }

  function openImport() {
    const area = h("textarea", { rows: "9", placeholder: "{ … }" });
    const apply = () => {
      const next = parseBackup(area.value);
      if (!next) { toast(t("bk.import.err")); return; }
      if (!confirm(t("bk.import.confirm"))) return;
      state = next;
      save(); render(); closeSheet();
      toast(t("bk.import.ok"));
      if (!state.region) setTimeout(openRegion, 350);
    };
    showSheet(h("div", null,
      h("h2", null, t("bk.import.title")),
      h("div", { class: "hint" }, t("bk.import.hint")),
      h("div", { class: "field" }, area),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: closeSheet }, t("cancel")),
        h("button", { class: "btn", onclick: apply }, t("bk.import.btn")))
    ));
  }

  /* ---------- Ubicación (la primera vez es obligatoria) ---------- */
  function openRegion() {
    const sel = h("select", null,
      h("option", { value: "", disabled: true, selected: !state.region }, t("region.pick")),
      window.REGIONS.map((r) => h("option", { value: r, selected: r === state.region }, r)));
    const town = h("input", { type: "text", placeholder: t("set.townph"), value: state.town, autocomplete: "off" });

    const apply = () => {
      if (!sel.value) { toast(t("err.region")); return; }
      state.region = sel.value;
      state.town = town.value.trim();
      save(); render(); closeSheet();
    };

    showSheet(h("div", null,
      h("h2", null, t("first.title")),
      h("div", { class: "hint" }, t("first.hint")),
      field(t("set.region"), sel),
      field(t("region.town"), town),
      h("div", { class: "actions" }, h("button", { class: "btn", onclick: apply }, t("next")))
    ));
  }

  /* ---------- Inicio ---------- */
  $("btn-add").addEventListener("click", () => openAdd());
  $("btn-menu").addEventListener("click", openMenu);
  $("btn-loc").addEventListener("click", () => go("settings"));
  render();
  if (!state.region) openRegion();
})();
