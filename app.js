/*
 * Statistical Fundamentals, the web version: the page. It shows what the laboratory in Python computes (worker.js runs
 * web/bridge.py in Pyodide) and sends it what the reader does; it computes nothing of the study itself.
 *
 *   the cover     the three benches on one thread, the Student | Teacher switch, the bar (share, sound, language);
 *                 in a desktop's window placed by gui/cover.py's numbers (arrangeCover), larger past full HD; the
 *                 title's column in its own order, on purpose: purpose, title, lead, then the switch (the desktop
 *                 puts the switch first; a visitor of the site reads what it is before choosing a mode)
 *   a bench       the bar (Home, the bench's name and stars, the pills of its steps), the column of the step's
 *                 controls, the figure (drawn by the lab in Python, as RGBA pixels), the strip of measures, View code
 *
 * The requests go one at a time to the worker, in order; a request that only refreshes (the pointer moving, the page
 * resized) replaces the one of its kind still waiting: the latest wins, so dragging on a phone stays usable. Each
 * answer is the whole view, which the page draws: the column is built once per step and language and then updated in
 * place (a slider being dragged, a field being typed in are never rebuilt under the hand).
 *
 * Three arrangements: the desktop's workbench (the column at the left, the figure on all the room left, the strip at
 * its foot: the figure asked at the stage's whole size, its box reserved before it comes, shown one pixel drawn to one
 * pixel of the screen and moved onto the screen's pixel grid); and a phone, one screen that never scrolls as a page, in portrait (phoneBench: the bar on one row, the
 * panel switch with the card's "i" and View code, the figure, the measures on one line, the dock, the foot) or in
 * landscape and any short or narrow window (landscapeBench: the column at the left, the switch in the bar, the figure
 * fitted to the stage's height with the measures at its side or under it). On a phone the figure is one panel at a time
 * in a box of one size: the page gives the box's room (`fit`) and the bridge draws each panel as wide as IT fits; the
 * controls are a dense dock, the only scroller, the card a sheet over it; the foot is one row (the filled button,
 * Restore) and its line says something over the dock's edge only when there is something to say. On a touch screen a
 * long press shows the tooltip of what is pressed (never the figure's, a slider's or a field's), a tap that of a measure
 * or of the foot's line.
 * Every text comes from the catalogs (texts.json); what is kept between visits (the language, the mode, the student's
 * stars, the sound) is in localStorage.
 */
"use strict";
(() => {
  const BUILD = document.body.dataset.build;
  const STORE = "statistical-fundamentals";
  const SOUNDS = {                       // gui/sounds.SOUNDS: cue -> [its length in seconds, its priority]
    navigate: [0.14, 1], advance: [0.26, 2], apply: [0.08, 1], complete: [0.36, 2],
    better: [0.38, 3], worse: [0.30, 3], discard: [0.16, 2], achieved: [0.46, 3],
  };
  const THROTTLE = 0.25;                 // seconds: gui/sounds.THROTTLE
  const TYPING_MS = 350;                 // gui/widgets.NumberField.TYPING_MS: a pause in the typing commits a number in range
  const BUSY_AFTER = 300;                // milliseconds a request may take before the page says it is computing
  const TIP_DELAY = 450;                 // milliseconds the pointer rests before a tooltip shows
  const MOST_RATIO = 2;                  // bridge.MOST_RATIO: a denser screen is drawn at 2 and scaled by the browser
  const COLUMN = 312, STAGE_INSETS = [20, 10, 20, 0], STAGE_GAP = 4;   // gui/lab_views
  const CODE_SIDE = 1200;                // the code panel beside the bench from this width (gui/main_window.SIDE_BY_SIDE_WIDTH)
  const COVER = {                        // gui/cover.py: the cover in a desktop's window (arrangeCover)
    column: 1240, path: 860, ledeShare: 0.30, ledeLeast: 320, ledeMost: 400, gap: 56, rail: 64, pad: 22, padY: 11,
    arrow: 24, cardGap: 14, rowUsual: 150, rowMost: 380, typeMost: 1.25, pictureShare: 0.30, pictureMost: 205,
    pictureTall: 0.45, textLeast: 280,
    screen: [1920, 1080], scaleMost: 1.4,  // a larger screen sees the cover of a full-HD one enlarged (zoom), up to scaleMost
  };
  // a phone (style.css's heights): the bar, the switch's row, the strip, the foot, as they come; the stage's padding
  const PHONE_BAR = 45, PHONE_ROW = 44, PHONE_STRIP = 44, PHONE_FOOT = 57, PHONE_GUTTER = 12, LANDSCAPE_PAD = [6, 12];
  const DOCK_GOOD = 125;                 // portrait: the dock keeps this much while the figure's box still has BOX_GOOD,
  const BOX_GOOD = 340;                  // then less, down to DOCK_FLOOR, and the box takes the rest (the smallest phones)
  const DOCK_FLOOR = 110;
  const ASIDE = 158;                     // landscape: the measures' column at the figure's side (150) and the gap to it
  const STRIP_GAP = 8, STRIP_MOST = 230;  // landscape: between the figure and its measures; the widest the measures' column gets
  const BELOW = PHONE_STRIP + STRIP_GAP;  // landscape: the measures' line under the figure and the gap over it
  const FIT_TOLERANCE = 40;              // a room this much larger or smaller (the browser's bars) asks for no new figure,
                                         // while the dock keeps DOCK_FLOOR (portrait) or the figure still fits (landscape)
  const SETTLE_MS = 220;                 // a phone's screen resized: the figure is asked for once it settles
  const LONG_PRESS = 500;                // milliseconds a touch rests before the tooltip of what it presses shows
  const QR_LIBRARY = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  const QR_INTEGRITY = "sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";
  const STAGES = ["python", "numpy", "matplotlib", "app", "cover"];

  // ---------------------------------------------------------------- texts
  let catalogs = { en: {} };
  let language = "en";

  function text(key, params) {
    let found = (catalogs[language] || {})[key];
    if (found === undefined) found = catalogs.en[key];
    if (found === undefined) found = "[" + key + "]";
    if (params) found = found.replace(/\{(\w*)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
    return found;
  }

  function browserLanguage() {
    const asked = new URLSearchParams(location.search).get("lang");
    if (asked === "en" || asked === "pt_BR") return asked;
    const languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    return languages.some((each) => String(each).toLowerCase().startsWith("pt")) ? "pt_BR" : "en";
  }

  // ---------------------------------------------------------------- what is kept between visits
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function save(values) {
    try {
      localStorage.setItem(STORE, JSON.stringify(Object.assign(load(), values)));
    } catch (error) {
      /* a private window: nothing kept, everything works */
    }
  }

  // ---------------------------------------------------------------- DOM
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function icon(name, extra) {
    return el("span", { class: "icon " + (extra || ""), style: `--icon: url("icons/${name}.svg")`, "aria-hidden": "true" });
  }

  function setTip(node, tip) {
    if (tip) node.dataset.tip = tip;
    else delete node.dataset.tip;
  }

  // ---------------------------------------------------------------- sound (gui/sounds.SoundController)
  const sound = {
    enabled: load().sound !== false,
    last: -Infinity, lastCue: null, until: 0, priority: 0, playing: null, cache: {},
    play(cue) {
      if (!this.enabled || !(cue in SOUNDS)) return;
      const now = performance.now() / 1000;
      const [length, priority] = SOUNDS[cue];
      if (now - this.last < THROTTLE && (priority === 1 || cue === this.lastCue)) return;
      if (now < this.until && priority < this.priority) return;
      try {
        if (this.playing) this.playing.pause();
        const audio = this.cache[cue] || (this.cache[cue] = new Audio("sounds/" + cue + ".wav"));
        audio.currentTime = 0;
        const promise = audio.play();
        if (promise && promise.catch) promise.catch(() => {});
        this.playing = audio;
      } catch (error) {
        return;                                                     // sound never prevents anything
      }
      this.last = now; this.lastCue = cue; this.until = now + length; this.priority = priority;
    },
    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled && this.playing) this.playing.pause();
      save({ sound: this.enabled });
    },
  };

  // ---------------------------------------------------------------- the worker and its queue
  let worker = null;
  let ready = false;
  let pending = [];
  let flight = null;
  let nextId = 1;
  let busyTimer = 0;
  let frameTimer = 0;
  const timings = window.sfTimings = [];

  function ask(op, args, options) {
    const item = { op, args: args || {}, transient: !!(options && options.transient), group: (options && options.group) || op };
    if (item.transient && pending.length) {
      const last = pending[pending.length - 1];
      if (last.transient && last.group === item.group) {
        pending[pending.length - 1] = item;                         // the latest wins
        pump();
        return;
      }
    }
    if (!item.transient && op !== "frame") clearTimeout(frameTimer);
    pending.push(item);
    pump();
  }

  function pump() {
    if (flight || !ready || !pending.length) return;
    const item = pending.shift();
    const request = Object.assign({ op: item.op }, item.args, { size: figureSize(), force: page.needImage });
    flight = { id: nextId++, item, size: request.size, at: performance.now() };
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => document.body.classList.add("busy"), BUSY_AFTER);
    worker.postMessage({ type: "ask", id: flight.id, request });
  }

  function received(message) {
    clearTimeout(busyTimer);
    document.body.classList.remove("busy");
    const done = flight;
    flight = null;
    if (message.pixels) page.needImage = false;
    if (done) {                                                     // how long each answer took: window.sfTimings
      timings.push({ op: done.item.op, ms: Math.round(performance.now() - done.at), image: !!message.pixels });
      if (timings.length > 200) timings.shift();
    }
    if (message.text) {
      try {
        apply(JSON.parse(message.text), JSON.parse(message.meta || "{}"), message.pixels, done);
      } catch (error) {
        showError(String(error && error.stack ? error.stack : error));
      }
    } else if (message.error) {
      showError(message.error);
    }
    pump();
  }

  // ---------------------------------------------------------------- the loading screen
  // The five stages as a list (those done ticked, the current one marked) over the bar of the whole, its share written
  // beside it: the same fraction the worker sends sets the bar and the number. The stage is also said (a hidden live line).
  function loadingTexts() {
    document.getElementById("loading-title").textContent = text("web.loading.title");
    document.getElementById("loading-note").textContent = text("web.loading.note");
    document.getElementById("loading-steps").replaceChildren(...STAGES.map((stage) => el("li", { class: "loading-step", dataset: { stage } },
      el("span", { class: "loading-dot" }), el("span", { class: "loading-name" }, text("web.loading." + stage)))));
  }

  function progress(stage, fraction) {
    const at = STAGES.indexOf(stage);
    for (const [index, item] of [...document.querySelectorAll(".loading-step")].entries()) {
      const done = index < at;
      item.classList.toggle("done", done);
      item.classList.toggle("now", index === at);
      const dot = item.firstElementChild;
      if (done && !dot.childElementCount) dot.append(icon("check"));
      else if (!done && dot.childElementCount) dot.replaceChildren();
    }
    const percent = Math.round(100 * fraction);
    document.getElementById("loading-fill").style.width = percent + "%";
    document.getElementById("loading-percent").textContent = text("web.loading.percent", { percent });
    document.getElementById("loading-stage").textContent = text("web.loading." + stage) + " " + text("web.loading.percent", { percent });
  }

  function failed(error) {
    const box = document.getElementById("loading-error");
    box.textContent = text("web.loading.failed", { error });
    box.hidden = false;
    const retry = document.getElementById("loading-retry");
    retry.textContent = text("web.loading.retry");
    retry.hidden = false;
    retry.onclick = () => location.reload();
  }

  function start() {
    loadingTexts();
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      failed(text("web.unsupported"));
      return;
    }
    progress(STAGES[0], 0.02);
    worker = new Worker("worker.js?v=" + BUILD);
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "progress") progress(message.stage, message.fraction);
      else if (message.type === "failed") failed(message.error);
      else if (message.type === "reply") received(message);
      else if (message.type === "ready") {
        progress("cover", 0.97);
        ready = true;
        const kept = load();
        const query = new URLSearchParams(location.search);
        const mode = query.get("mode");
        if (mode === "teacher" || mode === "student") kept.mode = mode;
        if (query.get("lang") === "en" || query.get("lang") === "pt_BR") kept.language = query.get("lang");
        const motion = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
        ask("boot", { saved: kept, language: browserLanguage(), motion });
      }
    };
    worker.onerror = (event) => failed(event.message || "worker");
    worker.postMessage({ type: "start", build: BUILD });
  }

  // ---------------------------------------------------------------- the arrangement
  const page = {
    view: null, screen: null, layout: null, signature: null, panel: "plane", meta: null, barSignature: null,
    nodes: {}, codeFunction: 0, codeShown: null, codeReadingKey: null, codeData: null, needImage: true,
    coverShown: false, entered: null, snapped: false,
  };

  // A screen or a step that comes enters (style.css: .enter, .first; the motion the reader allows): the class is put on
  // that change only, never on a redraw, and taken off when its animation ends; the figure is put on the screen's pixel
  // grid again then (snap measured it while it moved).
  function enter(node, kind) {
    node.classList.add(kind);
    node.addEventListener("animationend", function ended(event) {
      if (event.target !== node && kind !== "first") return;
      if (kind === "first" && !(event.target === node || event.target === node.querySelector(".journey-stop:last-child"))) return;
      node.classList.remove(kind);
      node.removeEventListener("animationend", ended);
      const canvas = page.nodes.canvas;
      if (canvas && node.contains(canvas)) snap(canvas, page.snapped);
    });
  }

  // A bench enters by its parts (the column, the stage, a phone's rows), never as a whole and never its code panel: a
  // transformed .bench would be the containing block of the code panel's position: fixed (off the desktop's side, and
  // on a phone), which would be laid out against the bench while it moves and then jump.
  function enterBench(nodes) {
    for (const part of nodes.bench.children) if (part !== nodes.code) enter(part, "enter");
  }

  function arrangementOf() {
    const width = window.innerWidth, height = window.innerHeight;
    if (width < 900 && height > width) return "portrait";
    if (width < 1000 || height < 560) return "compact";
    return "desktop";
  }

  function codeBeside() {
    return window.innerWidth >= CODE_SIDE && page.layout === "desktop";
  }

  function figureSize() {
    const ratio = Math.min(window.devicePixelRatio || 1, MOST_RATIO);
    const nodes = page.nodes;
    const now = arrangementOf();
    if (now !== "desktop") return phoneSize(ratio, now);
    if (page.screen !== "bench" || !nodes.stage || !nodes.stage.isConnected || page.layout !== now) {
      return estimateSize(ratio);
    }
    return Object.assign(stageRoom(), { ratio });
  }

  // The desktop's figure takes all the stage's room: its width inside the padding, its height down to the strip (no cap,
  // no aspect kept: the labs' own plan, explorers/panels.arrangement, composes the panels in whatever room it is given).
  function stageRoom() {
    const nodes = page.nodes;
    const style = getComputedStyle(nodes.stage);
    const width = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = nodes.stage.clientHeight - parseFloat(style.paddingTop) - nodes.strip.offsetHeight - STAGE_GAP;
    return { width: Math.max(width, 120), height: Math.max(height, 200) };
  }

  function estimateSize(ratio) {
    const bar = 49, strip = 56;                                     // the bar and the strip of two lines, as they come
    const code = page.view && page.view.bench && page.view.bench.code.open && window.innerWidth >= CODE_SIDE ? 560 : 0;
    return { width: Math.max(window.innerWidth - COLUMN - code - 40, 120), height: Math.max(window.innerHeight - bar - STAGE_INSETS[1] - strip, 200), ratio };
  }

  function landscapeColumn() {                                       // style.css: .bench.compact's --column
    return Math.min(Math.max(244, 0.36 * window.innerWidth), 300);
  }

  // A phone: the room of the figure's box (fit), measured on the bench when it is on screen, from style.css's heights
  // before. In portrait, the stage's width, and what the bench's height leaves under the switch's row, the strip and the
  // foot, less the dock (DOCK_GOOD while the box keeps BOX_GOOD, then less, never under DOCK_FLOOR); in landscape, the
  // stage beside the column, the measures at the figure's side (aside) or under it (below), as the bridge finds larger.
  // The bridge draws each panel as wide as it fits (fitting). The size asked last is kept while the room stays within
  // FIT_TOLERANCE of it (the browser's bars), and only while the dock keeps its floor or the figure still fits the stage.
  function phoneSize(ratio, layout) {
    const nodes = page.nodes;
    const built = page.screen === "bench" && page.layout === layout && nodes.bench && nodes.bench.isConnected;
    const bar = PHONE_BAR;                                          // the bar inside a bench (the cover's is taller)
    const held = page.asked, box = page.meta && page.meta.box ? page.meta.box[1] : 0;
    let fresh, keep;
    if (layout === "portrait") {
      let width, room;
      if (built) {
        const style = getComputedStyle(nodes.stage);
        width = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        room = nodes.bench.clientHeight - nodes.phoneRow.offsetHeight - nodes.strip.offsetHeight - nodes.foot.offsetHeight;
      } else {
        width = window.innerWidth - 2 * PHONE_GUTTER;
        room = window.innerHeight - bar - PHONE_ROW - PHONE_STRIP - PHONE_FOOT;
      }
      const dock = Math.min(DOCK_GOOD, Math.max(DOCK_FLOOR, room - BOX_GOOD));
      fresh = { width: Math.max(Math.round(width), 120), height: null, fit: Math.max(Math.round(room - dock), 120), ratio, panel: page.panel };
      keep = held && Math.abs(held.fit - fresh.fit) <= FIT_TOLERANCE && room - Math.min(box || held.fit, held.fit) >= DOCK_FLOOR;
    } else {
      let width, height;
      if (built) {
        const style = getComputedStyle(nodes.stage);
        width = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        height = nodes.stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      } else {
        width = window.innerWidth - landscapeColumn() - 2 * LANDSCAPE_PAD[1];
        height = window.innerHeight - bar - 2 * LANDSCAPE_PAD[0];
      }
      fresh = { width: Math.max(Math.round(width), 120), height: null, fit: Math.max(Math.round(height), 120), ratio, panel: page.panel,
                aside: ASIDE, below: BELOW };
      keep = held && fresh.fit >= held.fit && fresh.fit - held.fit <= FIT_TOLERANCE;
    }
    if (keep && held.fit && held.ratio === ratio && Math.abs(held.width - fresh.width) <= 1 && !held.aside === !fresh.aside) {
      return Object.assign({}, held, { panel: page.panel });
    }
    return fresh;
  }

  // ---------------------------------------------------------------- an answer drawn
  function apply(view, meta, pixels, done) {
    if (view.error) showError(view.error);
    page.view = view;
    if (view.persist) save(view.persist);
    if (language !== view.language) {
      language = view.language;
      document.documentElement.lang = language === "pt_BR" ? "pt-BR" : "en";
      page.signature = null;
    }
    document.title = text("cover.title");
    for (const cue of view.cues || []) sound.play(cue);
    drawBar(view);
    if (view.screen === "cover") drawCover(view);
    else drawBench(view, meta, pixels, done);
    const loading = document.getElementById("loading");
    if (!loading.hidden) {
      loading.hidden = true;
      document.getElementById("app").hidden = false;
    }
  }

  // ---------------------------------------------------------------- the bar
  // The language: a segmented switch of two options (PT | EN, the catalogs' short names: Portuguese first, the owner's
  // order, whatever order the bridge lists them in), a radio group named by "language", each option named by what it
  // shows, then the language's full name in that language ("PT, Português (Brasil)": WCAG 2.5.3), the full name its tooltip.
  const LANGUAGE_ORDER = ["pt_BR", "en"];
  function languageBox(view) {
    const box = el("div", { class: "segmented language", role: "radiogroup", "aria-label": view.bar.language });
    const rank = (code) => (LANGUAGE_ORDER.includes(code) ? LANGUAGE_ORDER.indexOf(code) : LANGUAGE_ORDER.length);
    const languages = view.languages.slice().sort((a, b) => rank(a[0]) - rank(b[0]));
    for (const [code, name] of languages) {
      const chosen = code === view.language;
      const short = text("web.language.short." + code);
      const option = el("button", { class: "segment" + (chosen ? " checked" : ""), type: "button", role: "radio", "aria-checked": String(chosen),
                                    "aria-label": short + ", " + name, lang: code === "pt_BR" ? "pt-BR" : "en",
                                    onclick: () => { if (code !== page.view.language) ask("language", { language: code }); } },
                        short);
      setTip(option, name);
      box.append(option);
    }
    return box;
  }

  function soundButton(view) {
    const label = sound.enabled ? view.bar.sound_off : view.bar.sound_on;
    const button = el("button", { class: "bar-icon sound", type: "button", "aria-label": label, "aria-pressed": String(sound.enabled),
                                  onclick: () => { sound.toggle(); drawBar(page.view); } },
                      icon(sound.enabled ? "sound_on" : "sound_off"));
    setTip(button, label);
    return button;
  }

  // The bar, drawn again only when what it shows changed (a slider dragged leaves it, and the panel switch a phone in
  // landscape keeps in it, alone).
  function drawBar(view) {
    const bar = document.getElementById("bar");
    const phone = view.screen !== "cover" && arrangementOf() !== "desktop";
    const bench = view.bench && { name: view.bench.name, stars: view.bench.stars, text: view.bench.stars_text, pills: view.bench.pills };
    const signature = JSON.stringify([view.screen, view.language, view.languages, view.bar, view.most, bench, sound.enabled, phone]);
    if (signature === page.barSignature && bar.childElementCount) return;
    page.barSignature = signature;
    bar.replaceChildren();
    bar.classList.toggle("in-bench", view.screen !== "cover");      // a phone inside a bench: one row, no language box
    bar.classList.toggle("phone", phone);
    if (view.screen === "cover") {
      bar.append(el("div", { class: "brand" }, el("img", { src: "icons/app.svg", alt: "", width: 20, height: 20 }),
                    el("span", { class: "bar-name" }, view.bar.app)));
      bar.append(el("div", { class: "bar-spring" }));
      const share = el("button", { class: "bar-icon share", type: "button", "aria-label": text("web.share"), onclick: openShare }, icon("qr"));
      setTip(share, text("web.share_tip"));
      bar.append(share);
    } else {
      const bench = view.bench;
      const home = el("button", { class: "home", type: "button", "aria-label": view.bar.home, onclick: () => ask("home") },
                      el("img", { src: "icons/app.svg", alt: "", width: 18, height: 18 }), el("span", { class: "home-word" }, view.bar.home));
      setTip(home, view.bar.home_tip);
      bar.append(home);
      const name = el("span", { class: "bar-name bench-name", "aria-label": bench.name }, el("span", { class: "bench-title" }, bench.name));
      if (bench.stars) name.append(stars(bench.stars, view.most, bench.stars_text));
      bar.append(name);
      bar.append(el("div", { class: "bar-spring" }));
      const pills = el("nav", { class: "pills", "aria-label": view.bar.steps });
      bench.pills.forEach((pill, index) => {
        if (index) pills.append(el("span", { class: "connector" + (bench.pills[index - 1].state === "done" ? " lit" : ""), "aria-hidden": "true" }));
        const locked = pill.state === "locked";
        const button = el("button", { class: "pill " + pill.state, type: "button", "aria-current": pill.state === "current" ? "step" : null,
                                      "aria-disabled": locked ? "true" : null, "aria-label": pill.tip.split("\n")[0],
                                      onclick: () => { if (!locked) ask("step", { index }); else showTipOf(button); } },
                          el("span", { class: "pill-mark" }, pill.state === "done" ? icon("check") : locked ? icon("padlock", "small") : String(index + 1)),
                          el("span", { class: "pill-name" }, pill.name), el("span", { class: "pill-short" }, pill.short));
        setTip(button, pill.tip);
        pills.append(button);
      });
      bar.append(pills);
      bar.append(el("div", { class: "bar-spring" }));
    }
    bar.append(soundButton(view));
    bar.append(languageBox(view));
  }

  // The stars as icons (the filled star, the outline of a hollow one), the letters kept as the text a screen reader
  // hears; with a label (the bar's, a cover card's), the run is one image named by it.
  const FULL_STAR = "★", HOLLOW_STAR = "☆";

  function starRun(run, label) {
    const node = el("span", { class: "stars", role: label ? "img" : null, "aria-label": label || null },
                    el("span", { class: "visually-hidden" }, run));
    for (const letter of run) node.append(icon(letter === FULL_STAR ? "star" : "star_outline", letter === FULL_STAR ? "full" : "hollow"));
    return node;
  }

  function stars(count, most, label) {
    return starRun(FULL_STAR.repeat(count) + HOLLOW_STAR.repeat(Math.max(most - count, 0)), label);
  }

  // A run of the star letters arriving in a text the bridge wrote (a status line, a measure's value) drawn as icons.
  function starify(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const found = [];
    while (walker.nextNode()) if (/[★☆]/.test(walker.currentNode.nodeValue)) found.push(walker.currentNode);
    for (const textNode of found) {
      const parts = textNode.nodeValue.split(/([★☆]+)/);
      textNode.replaceWith(...parts.filter(Boolean).map((part) => (/^[★☆]+$/.test(part) ? starRun(part) : document.createTextNode(part))));
    }
    return node;
  }

  // ---------------------------------------------------------------- the cover
  function drawCover(view) {
    const screen = document.getElementById("screen");
    const entering = page.screen !== "cover";                       // a screen change: never a cover answered again
    page.screen = "cover";
    page.entered = null;
    page.signature = null;
    page.nodes = {};
    closeCode();
    const cover = view.cover;
    const switcher = el("div", { class: "segmented mode-switch", role: "radiogroup", "aria-label": cover.mode_label });
    for (const mode of cover.modes) {
      switcher.append(el("button", { class: "segment" + (mode.key === view.mode ? " checked" : ""), type: "button", role: "radio",
                                     "aria-checked": String(mode.key === view.mode), onclick: () => ask("mode", { mode: mode.key }) }, mode.name));
    }
    const restart = el("button", { class: "quiet-button restart", type: "button", onclick: confirmRestart,
                                   style: cover.restart ? null : "visibility:hidden" }, cover.restart_texts.command);
    setTip(restart, cover.restart_texts.tip);
    const lede = el("section", { class: "lede" }, el("p", { class: "purpose" }, cover.purpose), el("h1", { class: "cover-title" }, cover.title),
                    el("p", { class: "lead" }, cover.lead), switcher, el("p", { class: "mode-line" }, cover.mode_line), restart);
    const journey = el("ol", { class: "journey" });
    cover.cards.forEach((card) => journey.append(coverCard(card)));
    const body = el("div", { class: "cover" }, el("div", { class: "cover-inner" }, lede, journey));
    if (entering) enter(body, page.coverShown ? "enter" : "first");   // shown again, it enters; first shown, its cards one by one
    page.coverShown = true;
    screen.replaceChildren(body);
    page.nodes = { cover: body, lede, journey };
    arrangeCover();
    if (window.ResizeObserver) {                                    // shown (the loading screen gone), resized, its fonts come
      if (!coverObserver) coverObserver = new ResizeObserver(() => {
        cancelAnimationFrame(coverFrame);
        coverFrame = requestAnimationFrame(arrangeCover);
      });
      coverObserver.disconnect();
      coverObserver.observe(body);
    }
    // The title's block is placed from text heights measured now, maybe in a fallback face: again once the web faces
    // have come (the observer sees the cover's box, not its texts' heights).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (page.nodes.cover === body) arrangeCover(); });
      if (!coverFonts) {                                            // a face that comes later (a glyph first shown now)
        coverFonts = true;
        document.fonts.addEventListener("loadingdone", () => { if (page.screen === "cover") arrangeCover(); });
      }
    }
    const last = journey.querySelector(`[data-bench="${cover.last}"]`);
    if (last && document.activeElement === document.body) last.focus({ preventScroll: true });
  }

  // The cover composed for the screen it is on, as the desktop's (gui/cover.CoverView.arrange): in a desktop's window the
  // title's column beside the journey, the two within COVER.column, centred; the three cards share the height of the first
  // screen, from their usual row up to the one that holds the largest square picture (COVER.rowMost), and a taller card has
  // a larger picture and larger texts; the cards in the middle of the screen, the title a little above theirs. On a phone
  // (or a short or narrow window) the cover keeps style.css's own arrangement.
  let coverObserver = null, coverFrame = 0, coverFonts = false;
  function arrangeCover() {
    const nodes = page.nodes, cover = nodes.cover;
    if (!cover || !cover.isConnected || !cover.clientWidth) return;   // not on screen yet: its observer calls again
    const props = ["--lede", "--path", "--row", "--picture", "--type", "--lede-top"];
    const inner = cover.firstElementChild;
    if (arrangementOf() !== "desktop") {
      cover.classList.remove("arranged");
      for (const prop of props) cover.style.removeProperty(prop);
      inner.style.zoom = "";
      return;
    }
    const style = getComputedStyle(cover);
    const outerWidth = cover.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const outerHeight = cover.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(Math.max(Math.min(window.innerWidth / COVER.screen[0], window.innerHeight / COVER.screen[1]), 1), COVER.scaleMost);
    inner.style.zoom = scale > 1 ? scale.toFixed(4) : "";           // a screen larger than a full-HD one: the whole composition larger
    const available = outerWidth / scale, screen = outerHeight / scale;
    const width = Math.min(available, COVER.column);
    const lede = Math.min(Math.max(COVER.ledeShare * width, COVER.ledeLeast), COVER.ledeMost);
    const path = Math.min(width - lede - COVER.gap, COVER.path);
    const card = path - COVER.rail;
    const usual = Math.min(COVER.pictureShare * card, COVER.pictureMost);
    const tall = (height) => Math.max(usual, Math.min(height - 2 * COVER.pad, COVER.pictureTall * card,
                                                      card - 3 * COVER.pad - COVER.arrow - COVER.textLeast));
    const tallest = Math.min(2 * COVER.pad + tall(COVER.rowMost), COVER.rowMost);
    const count = nodes.journey.children.length || 1;
    const row = Math.floor(Math.max(Math.min((screen - (count - 1) * COVER.cardGap) / count, tallest), COVER.rowUsual));
    const larger = 1 + (COVER.typeMost - 1) * Math.min(Math.max((row - COVER.rowUsual) / (COVER.rowMost - COVER.rowUsual), 0), 1);
    cover.classList.add("arranged");
    cover.style.setProperty("--lede", Math.round(lede) + "px");
    cover.style.setProperty("--path", Math.round(path) + "px");
    cover.style.setProperty("--row", row + "px");
    cover.style.setProperty("--picture", Math.round(Math.min(tall(row), row - 2 * COVER.padY)) + "px");
    cover.style.setProperty("--type", larger.toFixed(3));
    const shown = (node) => node.getBoundingClientRect().height / scale;      // layout pixels inside the zoom
    const block = shown(nodes.lede) - (parseFloat(getComputedStyle(nodes.lede).paddingTop) || 0);
    const cards = shown(nodes.journey);                             // as tall as the cards' texts need, at least `row` each
    const beside = Math.max(screen - cards, 0) / 2 + 0.4 * (cards - block);
    cover.style.setProperty("--lede-top", Math.round(Math.min(Math.max(beside, 0), Math.max(screen - block, 0))) + "px");
  }

  function coverCard(card) {
    const picture = coverPicture(card.picture);
    const name = el("div", { class: "card-name" }, el("span", {}, card.title));
    if (card.stars) name.append(stars(card.stars, 3, card.stars_text));
    const track = el("ol", { class: "track" });
    card.track.forEach((stop, index) => {
      if (index) track.append(el("li", { class: "track-line " + (card.track[index - 1].state === "done" ? "lit" : ""), "aria-hidden": "true" }));
      const worth = stop.worth ? el("span", { class: "track-worth kind-" + stop.worth[1] }, stop.worth[0]) : null;
      track.append(el("li", { class: "stop " + stop.state, "aria-label": stop.tip },
                      el("span", { class: "stop-mark", "aria-hidden": "true" }, stop.state === "done" ? icon("check") : null),
                      el("span", { class: "stop-name" }, stop.name), worth));
    });
    const open = () => { if (!card.locked) ask("open", { bench: card.key }); else showTipOf(button); };
    const button = el("button", { class: "bench-card" + (card.locked ? " locked" : ""), type: "button", "data-bench": card.key,
                                  "aria-disabled": card.locked ? "true" : null, onclick: open },
                      el("span", { class: "node", "aria-hidden": "true" }, card.number), picture,
                      el("span", { class: "card-texts" }, name, el("span", { class: "challenge" }, card.challenge), track),
                      card.locked ? icon("padlock", "card-lock") : el("span", { class: "arrow", "aria-hidden": "true" }, "→"));
    setTip(button, card.locked ? card.lock_tip : card.open_tip);
    return el("li", { class: "journey-stop" }, button);
  }

  function coverPicture(picture) {
    const [x0, x1, y0, y1] = picture.window;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 100 100`);
    svg.setAttribute("class", "picture");
    svg.setAttribute("aria-hidden", "true");
    const sx = (x) => ((x - x0) / (x1 - x0)) * 100, sy = (y) => 100 - ((y - y0) / (y1 - y0)) * 100;
    for (const mark of picture.marks) {
      if (mark.kind === "dots") {
        for (const [x, y] of mark.points) {
          const dot = document.createElementNS(ns, "circle");
          dot.setAttribute("cx", sx(x).toFixed(2)); dot.setAttribute("cy", sy(y).toFixed(2)); dot.setAttribute("r", "1.5");
          dot.setAttribute(mark.hollow ? "stroke" : "fill", mark.color);
          if (mark.hollow) { dot.setAttribute("fill", "none"); dot.setAttribute("stroke-width", "0.6"); }
          svg.append(dot);
        }
        continue;
      }
      const path = document.createElementNS(ns, mark.kind === "area" ? "polygon" : "polyline");
      path.setAttribute("class", "role-" + mark.role);              // the frame (role "axis") is the card's rounded well instead
      path.setAttribute("points", mark.points.map(([x, y]) => sx(x).toFixed(2) + "," + sy(y).toFixed(2)).join(" "));
      path.setAttribute("fill", mark.kind === "area" ? mark.color : "none");
      path.setAttribute("stroke", mark.color);
      path.setAttribute("stroke-width", (mark.width * 0.45).toFixed(2));
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.style.strokeWidth = mark.width * 0.8 + "px";
      if (mark.dashed) path.setAttribute("stroke-dasharray", "3 2");
      svg.append(path);
    }
    return svg;
  }

  function confirmRestart() {
    const words = page.view.cover.restart_texts;
    const dialog = document.getElementById("dialog");
    const cancel = el("button", { class: "quiet-button", type: "button", onclick: () => dialog.close() }, words.cancel);
    const confirm = el("button", { class: "danger-button", type: "button", onclick: () => { dialog.close(); ask("restart"); } }, words.confirm);
    dialog.replaceChildren(el("h2", {}, words.title), el("p", {}, words.text),
                           el("div", { class: "dialog-row" }, cancel, confirm));    // the main command last, as share's
    dialog.showModal();
    cancel.focus();
  }

  // ---------------------------------------------------------------- share: a QR code of this page
  let qrLoading = null;
  function qrLibrary() {
    if (window.QRCode) return Promise.resolve();
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const script = el("script", { src: QR_LIBRARY, integrity: QR_INTEGRITY, crossorigin: "anonymous", referrerpolicy: "no-referrer" });
        script.onload = resolve;
        script.onerror = () => { qrLoading = null; reject(new Error(QR_LIBRARY)); };
        document.head.append(script);
      });
    }
    return qrLoading;
  }

  function siteAddress() {
    return new URL(".", location.href).href;
  }

  function openShare() {
    const dialog = document.getElementById("dialog");
    const address = siteAddress();
    const code = el("div", { class: "qr" });
    const copy = el("button", { class: "quiet-button", type: "button" }, text("web.qr.copy"));
    copy.onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(address).then(() => { copy.textContent = text("web.qr.copied"); }, () => {});
    };
    const full = el("a", { class: "quiet-button", href: "qr.html", target: "_blank", rel: "noopener" }, text("web.qr.full"));
    const close = el("button", { class: "primary-small", type: "button", onclick: () => dialog.close() }, text("web.qr.close"));
    dialog.replaceChildren(el("h2", {}, text("web.qr.title")), el("p", {}, text("web.qr.lead")), code,
                           el("p", { class: "address" }, address), el("div", { class: "dialog-row" }, copy, full, close));
    dialog.showModal();
    close.focus();
    qrLibrary().then(() => {
      new window.QRCode(code, { text: address, width: 232, height: 232, colorDark: "#10151C", colorLight: "#EDF2F7",
                                correctLevel: window.QRCode.CorrectLevel.M });
    }, (error) => { code.textContent = text("web.qr.failed", { error: error.message }); });
  }

  // ---------------------------------------------------------------- a bench
  function drawBench(view, meta, pixels, done) {
    const bench = view.bench;
    const layout = arrangementOf();
    const signature = [bench.key, bench.step_key, view.language, view.mode, layout,
                       bench.lab.controls.map((c) => c.key + ":" + c.kind).join(",")].join("|");
    let built = false;
    const step = bench.key + "|" + bench.step_key;
    if (page.screen !== "bench" || signature !== page.signature) {
      const entering = page.screen !== "bench" || page.entered !== step;   // a screen or a step that comes: not a language, a turn
      page.layout = layout;
      buildBench(view);
      page.signature = signature;
      page.screen = "bench";
      page.entered = step;
      if (entering) enterBench(page.nodes);
      built = true;
    }
    updateBench(view);
    if (built && page.layout === "desktop" && !(meta && meta.width)) {   // the figure's box reserved at once: nothing moves
      const room = stageRoom();                                     // when the picture comes
      page.nodes.figureBox.style.width = room.width + "px";
      page.nodes.figureBox.style.height = room.height + "px";
    }
    const bar = document.getElementById("bar");                     // a phone in landscape: the switch, "i" and View code in the bar
    for (const old of bar.querySelectorAll(".bar-tools")) if (old !== page.nodes.barTools) old.remove();   // turned: no longer
    if (page.nodes.barTools && page.nodes.barTools.parentNode !== bar) bar.insertBefore(page.nodes.barTools, bar.querySelector(".sound"));
    if (meta && meta.width) {
      if (done && done.size) page.asked = done.size;
      drawFigure(meta, pixels);
    }
    drawCode(bench.code);
    scheduleFrame(bench.lab.playing);
    if ((built && !pixels) || stale()) {
      ask("render", {}, { transient: true, group: "render" });       // a new canvas, or the page settled at another size
    }
  }

  function stale() {
    const meta = page.meta, asked = page.asked;
    if (!meta || !meta.width || !asked) return true;
    const now = figureSize();
    if (now.ratio !== asked.ratio || (now.panel || null) !== (asked.panel || null)) return true;
    if (now.fit) return now.width !== asked.width || now.fit !== asked.fit || !now.aside !== !asked.aside;   // a phone: the bridge fits
    if (Math.abs(now.width - meta.width) > 1) return true;
    if (now.height === null) return false;
    if (meta.height > (asked.height || 0) + 1) return now.height > meta.height + 1;     // held at the lab's least height
    return Math.abs(now.height - meta.height) > 1;
  }

  function scheduleFrame(playing) {
    clearTimeout(frameTimer);
    if (playing) frameTimer = setTimeout(() => ask("frame", { token: playing.token }), playing.ms);
  }

  function buildBench(view) {
    const lab = view.bench.lab;
    const nodes = page.nodes = { controls: {}, commands: {} };
    page.needImage = true;
    page.codeShown = null;
    const title = el("h2", { class: "lab-title" }, lab.title);
    setTip(title, lab.purpose);
    nodes.cardHeading = el("div", { class: "card-heading" });
    nodes.cardRows = el("div", { class: "card-rows" });
    nodes.card = el("div", { class: "card" }, nodes.cardHeading, nodes.cardRows);
    const body = el("div", { class: "column-body" });
    for (const action of lab.featured) body.append(featuredButton(action));
    for (const control of lab.controls) body.append(controlGroup(control));
    if (lab.transport.length) {
      const icons = el("div", { class: "transport-icons" });
      for (const action of lab.transport) {
        const button = el("button", { class: "transport-button", type: "button", onclick: () => ask("action", { key: action.key }) }, icon(action.icon));
        nodes.commands[action.key] = { button, kind: "icon" };
        icons.append(button);
      }
      nodes.stageName = el("div", { class: "stage-name" });
      nodes.transport = el("div", { class: "transport" }, icons, nodes.stageName);
      body.append(nodes.transport);
    }
    const chips = el("div", { class: "chips" });
    for (const action of lab.chips) chips.append(chipButton(action));
    body.append(chips);
    nodes.status = el("p", { class: "status", role: "status" });
    nodes.missing = el("p", { class: "missing" });
    nodes.filled = null;
    if (lab.filled) {
      nodes.filled = el("button", { class: "filled", type: "button", onclick: () => {
        const filled = page.view.bench.lab.filled;
        const typed = flushTyped();                                 // a number still being typed counts (NumberField.flush)
        if (filled && (filled.enabled || (typed && filled.forward))) ask("action", { key: filled.key });
        else showTipOf(nodes.filled);
      } });
    }
    nodes.restore = el("button", { class: "restore", type: "button", onclick: () => ask("restore") }, icon("reset", "small"), el("span", {}, lab.restore.label));
    setTip(nodes.restore, lab.restore.tip);
    if (!lab.restore.shown) nodes.restore.hidden = true;

    nodes.panels = el("div", { class: "segmented panel-switch", role: "tablist", "aria-label": text("web.panels"), hidden: true });
    nodes.canvas = el("canvas", { class: "figure", tabindex: "0", role: "img" });
    nodes.alert = el("div", { class: "alert", hidden: true });
    nodes.busy = el("div", { class: "busy-note", "aria-hidden": "true" }, text("web.busy"));
    nodes.figureBox = el("div", { class: "figure-box" }, nodes.canvas, nodes.alert, nodes.busy);
    nodes.figureBox.addEventListener("scroll", () => fold(nodes.figureBox, false), { passive: true });
    nodes.metrics = el("div", { class: "metrics" });
    nodes.table = el("div", { class: "lab-table", hidden: true });
    nodes.code = el("aside", { class: "code-panel", hidden: true });
    const benchNode = page.layout === "portrait" ? phoneBench(lab, title, body)
                    : page.layout === "compact" ? landscapeBench(lab, title, body) : workbench(lab, title, body);
    document.getElementById("screen").replaceChildren(benchNode);
    nodes.bench = benchNode;
    wireFigure(nodes.canvas);
    if (page.layout !== "desktop") {
      const size = figureSize();                                    // the box before the figure comes: the one known, or the room
      const known = page.meta && page.meta.box && page.asked && page.asked.fit === size.fit && page.asked.width === size.width
                    && !page.asked.aside === !size.aside;
      const box = known ? page.meta.box : [size.width, size.fit];
      nodes.figureBox.style.height = box[1] + "px";
      if (page.layout === "compact") {
        nodes.figureBox.style.width = box[0] + "px";
        nodes.stage.classList.toggle("beside", known ? !!page.meta.beside : true);
      }
      observe(nodes.bench);
    } else {
      observe(nodes.stage);
      observe(nodes.strip);
    }
  }

  // The desktop's workbench: the column (title, card, controls, foot) beside the stage (the panel switch, the figure, the
  // strip with View code at its end).
  function workbench(lab, title, body) {
    const nodes = page.nodes;
    const head = el("div", { class: "column-head" }, title, el("div", { class: "card-slot" }, nodes.card), el("div", { class: "rule" }));
    const foot = el("div", { class: "column-foot" }, nodes.status, nodes.missing);
    if (nodes.filled) foot.append(nodes.filled);
    foot.append(nodes.restore);
    const column = el("aside", { class: "column" }, head, body, foot);
    nodes.column = column;
    nodes.links = el("div", { class: "strip-end" });
    for (const link of lab.links) {
      const button = el("button", { class: "link", type: "button", onclick: () => ask("action", { key: link.key }) }, link.label);
      setTip(button, link.tip);
      nodes.links.append(button);
    }
    nodes.strip = el("div", { class: "strip" }, nodes.metrics, nodes.links);
    nodes.stage = el("section", { class: "stage" }, nodes.panels, nodes.figureBox, nodes.strip, nodes.table);
    return el("div", { class: "bench desktop" }, column, nodes.stage, nodes.code);
  }

  // The pieces the two phone arrangements share (dense, style.css): the card's "i" and View code as icons; the dock (the
  // column's controls, the only thing that scrolls, the card a sheet over it, the step's title in the sheet's head: the
  // current pill names the step); the foot (the filled button and Restore as an icon on one row, and the status or the
  // missing line over it, over the dock's lower edge, only while it says something); the measures' strip.
  function phoneTools(lab) {
    const nodes = page.nodes;
    nodes.info = el("button", { class: "phone-icon info", type: "button", "aria-expanded": "false", "aria-controls": "card-sheet",
                                onclick: () => openSheet(nodes.sheet.hidden) },
                    el("span", { class: "info-glyph", "aria-hidden": "true" }, "i"));
    setTip(nodes.info, text("web.card.tip"));
    const tools = el("div", { class: "phone-tools" }, nodes.info);
    for (const link of lab.links) {
      const button = el("button", { class: "phone-icon", type: "button", "aria-label": link.label,
                                    onclick: () => ask("action", { key: link.key }) }, icon("book"));
      setTip(button, link.tip);
      tools.append(button);
    }
    return tools;
  }

  function dockSlot(title, body) {
    const nodes = page.nodes;
    body.classList.add("dock");
    body.append(nodes.table);
    body.addEventListener("scroll", () => fold(body, false), { passive: true });
    nodes.dock = body;
    const close = el("button", { class: "phone-icon sheet-close", type: "button", "aria-label": text("web.card.close"),
                                 onclick: () => openSheet(false) }, icon("close"));
    setTip(close, text("web.card.close"));
    nodes.sheet = el("div", { class: "sheet", id: "card-sheet", role: "dialog", tabindex: "-1", hidden: true },
                     el("div", { class: "sheet-head" }, title, close), nodes.card);
    nodes.sheetClose = close;
    return el("div", { class: "dock-slot" }, body, nodes.sheet);
  }

  function phoneFoot(lab) {
    const nodes = page.nodes;
    nodes.footLine = el("div", { class: "foot-line", dataset: { tap: "tip" } }, nodes.status, " ", nodes.missing);
    nodes.restore.setAttribute("aria-label", lab.restore.label);   // its icon alone (style.css): the filled button keeps the room
    const row = el("div", { class: "foot-row" }, nodes.filled, nodes.restore);
    return el("div", { class: "column-foot" }, nodes.footLine, row);
  }

  function phoneStrip() {
    const nodes = page.nodes;
    nodes.strip = el("div", { class: "strip" }, nodes.metrics);
    nodes.metrics.addEventListener("scroll", () => fold(nodes.metrics, !nodes.stage.classList.contains("beside")), { passive: true });
    return nodes.strip;
  }

  // A phone in portrait: one screen. The switch's row (the panels, "i", View code), the figure's box, the strip on one
  // line, the dock, the foot.
  function phoneBench(lab, title, body) {
    const nodes = page.nodes;
    nodes.phoneRow = el("div", { class: "phone-row" }, nodes.panels, phoneTools(lab));
    nodes.stage = el("section", { class: "stage" }, nodes.figureBox);
    const strip = phoneStrip();
    const slot = dockSlot(title, body);
    nodes.foot = phoneFoot(lab);
    return el("div", { class: "bench portrait dense" }, nodes.phoneRow, nodes.stage, strip, slot, nodes.foot, nodes.code);
  }

  // A phone in landscape (and any short or narrow window): the desktop's places, nothing that scrolls but the dock. The
  // column at the left (the dock and the foot, no title, the card behind "i"); the panel switch, "i" and View code in the
  // bar (barTools); the stage: the figure fitted to its height, the measures in a column at its side (beside) or in a line
  // under it, as the bridge finds the panels larger.
  function landscapeBench(lab, title, body) {
    const nodes = page.nodes;
    nodes.barTools = el("div", { class: "bar-tools" }, nodes.panels, phoneTools(lab));
    const slot = dockSlot(title, body);
    nodes.foot = phoneFoot(lab);
    nodes.column = el("aside", { class: "column" }, slot, nodes.foot);
    nodes.stage = el("section", { class: "stage" }, nodes.figureBox);
    nodes.stage.append(phoneStrip());
    return el("div", { class: "bench compact dense" }, nodes.column, nodes.stage, nodes.code);
  }

  // The card's sheet, opened over the dock (focus goes into it) or closed (focus back to its "i").
  function openSheet(open) {
    const nodes = page.nodes;
    if (!nodes.sheet) return;
    const was = !nodes.sheet.hidden;
    nodes.sheet.hidden = !open;
    nodes.info.setAttribute("aria-expanded", String(open));
    if (open) nodes.sheetClose.focus({ preventScroll: true });
    else if (was && nodes.sheet.contains(document.activeElement) || was && document.activeElement === document.body) {
      nodes.info.focus({ preventScroll: true });
    }
  }

  // A scroller with more beyond its edge says so: the class "more" fades that edge (style.css).
  function fold(node, across) {
    if (!node || !node.isConnected) return;
    const more = across ? node.scrollLeft + node.clientWidth < node.scrollWidth - 2
                        : node.scrollTop + node.clientHeight < node.scrollHeight - 2;
    node.classList.toggle("more", more);
  }

  // Every command of the column the page updates: the featured ones, the transport's, the chips and those that stand in
  // the row of a typed control (Action.beside).
  function commandsOf(lab) {
    return [...lab.featured, ...lab.transport, ...lab.chips, ...lab.controls.flatMap((control) => control.beside || [])];
  }

  // A chip: a quiet rectangle, its icon before its text when the lab gives it one (Action.mark: never the icon alone).
  function chipButton(action, extra) {
    const label = el("span", { class: "chip-label" });
    const button = el("button", { class: "chip" + (extra ? " " + extra : ""), type: "button", onclick: () => ask("action", { key: action.key }) },
                      action.mark ? icon(action.mark, "mark") : null, label);
    page.nodes.commands[action.key] = { button, kind: "chip", label };
    return button;
  }

  function featuredButton(action) {
    const label = el("span", { class: "featured-name" });
    const detail = el("span", { class: "featured-detail" });
    const title = el("span", { class: "featured-title" }, action.mark ? icon(action.mark, "mark") : null, label);
    const button = el("button", { class: "featured", type: "button", onclick: () => ask("action", { key: action.key }) }, title, detail);
    page.nodes.commands[action.key] = { button, kind: "featured", label, detail };
    return button;
  }

  // The options of a segmented control with their icons (Control.icons), as gui/lab_views.ColumnSegmented places them:
  // beside their names while the row holds every option so, otherwise over their names, and one under another (beside)
  // only when even that is too wide: every option of a control alike, never mixed. Measured on the page as laid out.
  function fitSegments() {
    for (const parts of Object.values(page.nodes.controls || {})) {
      const row = parts.segments;
      if (!row || !row.classList.contains("marked") || !row.isConnected || !row.offsetParent) continue;
      for (const way of ["", "over", "stacked"]) {
        row.classList.remove("over", "stacked");
        if (way) row.classList.add(way);
        const tops = parts.buttons.filter((button) => !button.hidden).map((button) => button.offsetTop);
        if (way === "stacked" || Math.max(...tops) - Math.min(...tops) < 2) break;   // all on one row
      }
    }
  }

  function controlGroup(control) {
    const group = el("div", { class: "control" + (control.alone ? " alone" : "") });
    setTip(group, control.tip);
    const parts = { group, control };
    if (control.kind === "check") {
      parts.input = el("input", { type: "checkbox", onchange: (event) => ask("control", { key: control.key, value: event.target.checked }) });
      group.append(el("label", { class: "check" }, parts.input, control.label));
    } else if (control.kind === "buttons") {
      if (control.label) group.append(el("div", { class: "control-label" }, control.label));
      parts.segments = el("div", { class: "segmented column-segmented", role: "radiogroup", "aria-label": control.label });
      const icons = control.icons || [];
      if (icons.length && icons.every(Boolean)) parts.segments.classList.add("marked");
      parts.buttons = control.names.map((name, index) => {
        const button = el("button", { class: "segment", type: "button", role: "radio", onclick: () => {
          const now = page.nodes.controls[control.key].last;
          if (now && now.locked[index]) showTipOf(button);
          else ask("control", { key: control.key, value: index });
        } }, icons[index] ? icon(icons[index], "mark") : null,
             el("span", { class: "segment-text" }, el("span", { class: "segment-name" }, name), el("span", { class: "segment-lock" })));
        parts.segments.append(button);
        return button;
      });
      group.append(parts.segments);
    } else if (control.kind === "typed") {
      group.append(el("div", { class: "control-label" }, control.label));
      parts.input = el("input", { class: "number", type: "text", inputmode: "numeric", pattern: "[0-9]*", autocomplete: "off",
                                  "aria-label": control.label, placeholder: control.placeholder });
      setTip(parts.input, control.field_tip);
      const commit = () => commitTyped(control.key, parts.input);
      parts.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const now = page.nodes.controls[control.key].last;
          const base = parseInt(parts.input.value, 10);
          const start = Number.isFinite(base) ? base : (now.value ?? now.least);
          parts.input.value = String(Math.min(Math.max(start + (event.key === "ArrowUp" ? 1 : -1), now.least), now.most));
          commit();
        } else if (event.key === "Escape") { parts.input.value = valueText(page.nodes.controls[control.key].last.value); parts.input.blur(); }
      });
      parts.input.addEventListener("blur", commit);
      parts.input.addEventListener("input", () => {                 // a number in range counts once the typing pauses
        clearTimeout(parts.typing);
        parts.typing = setTimeout(() => flushOne(control.key), TYPING_MS);
      });
      const line = el("div", { class: "typed-line" }, el("span", { class: "symbol" }, control.symbol), parts.input);
      for (const action of control.beside || []) line.append(chipButton(action, "beside"));   // Action.beside: at the field's right
      group.append(line);
      if (control.shortcuts) {
        parts.picks = el("div", { class: "segmented picks" });
        parts.pickButtons = control.shortcuts.map((pick, index) => {
          const button = el("button", { class: "segment", type: "button", onclick: () => ask("pick", { key: control.key, index }) }, pick.text);
          setTip(button, pick.tip);
          parts.picks.append(button);
          return button;
        });
        if (control.beside && control.beside.length) group.append(el("div", { class: "picks-line" }, parts.picks));   // the line under
        else line.append(parts.picks);
      }
    } else {
      group.append(el("div", { class: "control-label" }, control.label));
      parts.value = el("span", { class: "slider-value" });
      parts.input = el("input", { class: "slider", type: "range", min: "0", step: "1", "aria-label": control.label });
      setTip(parts.input, control.shortcuts ? control.fine_tip : "");
      parts.input.addEventListener("input", (event) => {
        sliderFill(parts.input);
        ask("control", { key: control.key, value: Number(event.target.value) }, { transient: true, group: "slider:" + control.key });
      });
      parts.input.addEventListener("pointerdown", () => { parts.dragging = true; });
      const release = () => { parts.dragging = false; };
      parts.input.addEventListener("pointerup", release);
      parts.input.addEventListener("pointercancel", release);
      parts.input.addEventListener("change", release);
      group.append(el("div", { class: "slider-line" }, parts.value, parts.input));
    }
    if ("line" in control) {
      parts.line = el("div", { class: "control-line" });
      group.append(parts.line);
    }
    page.nodes.controls[control.key] = parts;
    return group;
  }

  // The part of a slider's track travelled (style.css's --fill: WebKit draws it from there; Mozilla has its own progress).
  function sliderFill(input) {
    const top = Number(input.max) || 0;
    input.style.setProperty("--fill", top > 0 ? (100 * Number(input.value) / top).toFixed(2) + "%" : "0%");
  }

  function valueText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function pendingNumber(key) {
    const parts = page.nodes.controls[key];
    const now = parts && parts.last;
    if (!now || !parts.input) return null;
    const typed = parts.input.value.trim();
    if (!/^\d+$/.test(typed)) return null;
    const number = parseInt(typed, 10);
    return number >= now.least && number <= now.most && number !== now.value ? number : null;
  }

  function flushOne(key) {
    const parts = page.nodes.controls[key];
    if (parts) clearTimeout(parts.typing);
    const number = pendingNumber(key);
    if (number === null) return false;
    parts.last = Object.assign({}, parts.last, { value: number });
    ask("control", { key, value: number });
    return true;
  }

  function flushTyped() {
    let any = false;
    for (const [key, parts] of Object.entries(page.nodes.controls || {})) {
      if (parts.control.kind === "typed") any = flushOne(key) || any;
    }
    return any;
  }

  function commitTyped(key, input) {
    clearTimeout(page.nodes.controls[key] && page.nodes.controls[key].typing);
    const parts = page.nodes.controls[key];
    const now = parts && parts.last;
    if (!now) return;
    const typed = input.value.trim();
    if (typed === "") {
      if (now.empty) { if (now.value !== null) ask("control", { key, value: null }); }
      else input.value = valueText(now.value);
      return;
    }
    const number = parseInt(typed, 10);
    if (!Number.isFinite(number) || !/^\d+$/.test(typed)) {
      input.value = valueText(now.value);                           // any other text gives the last value back
      return;
    }
    const clamped = Math.min(Math.max(number, now.least), now.most);
    input.value = String(clamped);
    if (clamped !== now.value) ask("control", { key, value: clamped });
  }

  function updateBench(view) {
    const lab = view.bench.lab;
    const nodes = page.nodes;
    nodes.cardHeading.textContent = lab.card.heading;
    nodes.cardRows.replaceChildren(...lab.card.rows.map(([label, value, kind]) =>
      el("div", { class: "card-row" }, el("span", { class: "card-label", html: label }), el("span", { class: "card-value kind-" + kind, html: value }))));
    nodes.card.hidden = !(lab.card.heading || lab.card.rows.length);
    for (const control of lab.controls) updateControl(control);
    for (const action of commandsOf(lab)) updateCommand(action);
    if (nodes.stageName) {
      nodes.stageName.textContent = lab.stage;
      setTip(nodes.stageName, lab.stage);
    }
    nodes.status.textContent = lab.status;
    starify(nodes.status);
    nodes.status.classList.toggle("ok", lab.status_kind === "ok");
    nodes.status.hidden = !lab.status;
    nodes.missing.textContent = lab.missing;
    nodes.missing.hidden = !lab.missing;
    if (nodes.filled && lab.filled) {
      const filled = lab.filled;
      nodes.filled.textContent = filled.label;
      nodes.filled.setAttribute("aria-disabled", filled.enabled ? "false" : "true");
      nodes.filled.classList.toggle("disabled", !filled.enabled);
      if (filled.toggle) nodes.filled.setAttribute("aria-pressed", String(filled.checked));
      setTip(nodes.filled, filled.tip);
    }
    nodes.metrics.replaceChildren(...lab.metrics.map(metric));
    if (lab.alert) {
      nodes.alert.textContent = lab.alert.text;
      nodes.alert.className = "alert" + (lab.alert.warning ? " warning" : "");
      nodes.alert.hidden = false;
    } else {
      nodes.alert.hidden = true;
    }
    nodes.canvas.setAttribute("aria-label", lab.lead || lab.title);
    setTip(nodes.canvas, lab.figure_tip);
    nodes.canvas.style.cursor = lab.cursor || "";
    if (lab.table) {
      nodes.table.hidden = false;
      nodes.table.replaceChildren(tableNode(lab.table));
    } else {
      nodes.table.hidden = true;
    }
    if (nodes.footLine) {                                           // a phone: the card behind its "i", the foot's line when it says
      nodes.info.hidden = nodes.card.hidden;                        // something, an empty transport row folded away
      nodes.info.setAttribute("aria-label", lab.card.heading || lab.title);
      nodes.sheet.setAttribute("aria-label", lab.card.heading || lab.title);
      if (nodes.card.hidden) openSheet(false);
      const said = [lab.status, lab.missing].filter(Boolean).join("\n");
      setTip(nodes.footLine, said);
      nodes.bench.classList.toggle("said", !!said);
      if (nodes.transport) {
        const shown = lab.transport.some((action) => action.visible) || !!lab.stage;
        nodes.transport.hidden = !shown;
      }
      fold(nodes.metrics, !nodes.stage.classList.contains("beside"));
      fold(nodes.dock, false);
    }
    fitSegments();
  }

  function updateControl(control) {
    const parts = page.nodes.controls[control.key];
    if (!parts) return;
    parts.last = control;
    parts.group.hidden = !control.visible;
    if (control.kind === "check") {
      parts.input.checked = control.checked;
    } else if (control.kind === "buttons") {
      parts.buttons.forEach((button, index) => {
        const checked = index === control.index;
        const locked = control.locked[index];
        button.classList.toggle("checked", checked);
        button.setAttribute("aria-checked", String(checked));
        button.classList.toggle("locked", !!locked);
        button.setAttribute("aria-disabled", locked ? "true" : "false");
        button.tabIndex = locked ? -1 : 0;
        button.querySelector(".segment-lock").replaceChildren(locked ? icon("padlock", "small") : "");
        setTip(button, locked || "");
      });
    } else if (control.kind === "typed") {
      if (document.activeElement !== parts.input) parts.input.value = valueText(control.value);
      (parts.pickButtons || []).forEach((button, index) => button.classList.toggle("checked", control.shortcuts[index].checked));
    } else {
      parts.value.textContent = control.text;
      parts.input.max = String(Math.max(control.top, 0));
      parts.input.disabled = control.top <= 0;
      if (!parts.dragging) parts.input.value = String(control.index);
      sliderFill(parts.input);
    }
    if (parts.line) parts.line.textContent = control.line || "";
  }

  function updateCommand(action) {
    const found = page.nodes.commands[action.key];
    if (!found) return;
    const button = found.button;
    button.hidden = !action.visible && found.kind !== "icon";
    button.style.visibility = !action.visible && found.kind === "icon" ? "hidden" : "";
    button.disabled = !action.enabled;
    if (action.toggle) button.setAttribute("aria-pressed", String(action.checked));
    if (found.kind === "featured") {
      found.label.textContent = action.label;
      found.detail.textContent = action.detail;
      setTip(button, action.tip);
    } else if (found.kind === "icon") {
      button.replaceChildren(icon(action.icon));
      button.setAttribute("aria-label", action.label);
      setTip(button, action.label);
    } else {
      found.label.textContent = action.label;
      setTip(button, action.tip);
    }
  }

  function metric(item) {
    const title = el("div", { class: "metric-title" });
    if (item.color) title.append(el("span", { class: "metric-dot", style: "color:" + item.color }, "●"));
    title.append(el("span", { html: item.title }));
    const line = el("div", { class: "metric-line" }, starify(el("span", { class: "metric-value kind-" + item.kind, html: item.value })));
    if (item.detail) line.append(el("span", { class: "metric-detail kind-" + item.detail_kind, html: item.detail }));
    const node = el("div", { class: "metric" + (item.strong ? " strong" : ""), tabindex: "0", dataset: { tap: "tip" } }, title, line);
    setTip(node, item.tip);
    return node;
  }

  function tableNode(table) {
    const rows = [el("tr", {}, ...table.columns.map((c) => el("th", { html: c })))];
    table.rows.forEach((row, index) => rows.push(el("tr", { class: index === table.chosen ? "chosen" : "" }, ...row.map((c) => el("td", { html: c })))));
    if (table.total.length) rows.push(el("tr", { class: "total" }, ...table.total.map((c) => el("td", { html: c }))));
    return el("table", {}, ...rows);
  }

  // ---------------------------------------------------------------- the figure
  function drawFigure(meta, pixels) {
    const nodes = page.nodes;
    page.meta = meta;
    let height = (meta.bottom ?? meta.height) - (meta.top ?? 0);
    let width = meta.width;
    if (page.layout === "desktop" || !meta.box) {
      nodes.figureBox.style.height = height + "px";
      nodes.figureBox.style.width = meta.width + "px";
    } else {                                                        // a phone: one box for the three panels, the panel centred in it
      const [boxWidth, boxHeight] = meta.box;
      nodes.figureBox.style.height = boxHeight + "px";
      nodes.figureBox.style.width = page.layout === "portrait" ? "" : boxWidth + "px";
      const shown = (meta.panels || []).includes(page.panel) ? page.panel : "plane";
      const scrolls = (meta.scrolls || []).includes(shown) && height > boxHeight;
      if (nodes.figureBox.dataset.shown !== shown) nodes.figureBox.scrollTop = 0;   // another panel: from its top
      nodes.figureBox.dataset.shown = shown;
      nodes.figureBox.classList.toggle("scrolls", scrolls);        // the 3D view or the third panel, as wide as the box:
      if (height > boxHeight && !scrolls) {                         // scrolled in it; the plane drawn at the bridge's least
        width = width * boxHeight / height;                         // width (FIT_LEAST) and still too tall: shown whole,
        height = boxHeight;                                         // scaled down to the box
      }
      if (page.layout === "compact") {
        nodes.stage.classList.toggle("beside", !!meta.beside);      // the measures' column as wide as the room left, within
        const style = getComputedStyle(nodes.stage);                // bounds: its width never follows its values (no jump)
        const room = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - boxWidth - STRIP_GAP;
        nodes.strip.style.width = meta.beside ? Math.round(Math.min(Math.max(room, ASIDE - STRIP_GAP), STRIP_MOST)) + "px" : "";
        fold(nodes.metrics, !meta.beside);
      }
    }
    const canvas = nodes.canvas;
    const whole = width === meta.width && meta.pixel_width && meta.ratio;   // shown at its own density: one pixel drawn on one
    canvas.style.width = (whole ? meta.pixel_width / meta.ratio : width) + "px";      // pixel of the screen, never resampled
    canvas.style.height = (whole ? meta.pixel_height / meta.ratio : height) + "px";
    if (pixels && meta.pixel_width) {
      if (canvas.width !== meta.pixel_width) canvas.width = meta.pixel_width;
      if (canvas.height !== meta.pixel_height) canvas.height = meta.pixel_height;
      const context = canvas.getContext("2d");
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), meta.pixel_width, meta.pixel_height), 0, 0);
    }
    snap(canvas, whole && meta.ratio === Math.min(window.devicePixelRatio || 1, MOST_RATIO));
    const panels = meta.panels || [];
    const switching = panels.length > 0 && page.layout !== "desktop" && !!meta.box;
    nodes.panels.hidden = !switching;
    if (!nodes.panels.hidden) {
      if (!panels.includes(page.panel)) page.panel = panels[0];
      const names = { plane: text("web.panel.plane"), space: text("web.panel.space"),
                      third: text("web.panel.third." + page.view.bench.step_key) };
      nodes.panels.replaceChildren(...panels.map((panel) => el("button", {
        class: "segment" + (panel === page.panel ? " checked" : ""), type: "button", role: "tab", "aria-selected": String(panel === page.panel),
        onclick: () => { page.panel = panel; ask("render", {}, { transient: true, group: "render" }); } }, names[panel])));
    }
    canvas.dataset.panel = switching ? page.panel : "";
    if (nodes.figureBox.classList.contains("scrolls")) fold(nodes.figureBox, false);   // more below: its edge fades
  }

  // On a screen of 1.25 or 1.5 device pixels per CSS pixel, a box's edge may fall between two device pixels (the bar is
  // 49 CSS pixels high): the canvas is moved by that fraction, so that its pixels lie on the screen's and stay crisp.
  function snap(canvas, exact) {
    page.snapped = exact;
    canvas.style.transform = "";
    if (!exact) return;
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    const dx = (Math.round(box.left * ratio) - box.left * ratio) / ratio, dy = (Math.round(box.top * ratio) - box.top * ratio) / ratio;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) canvas.style.transform = `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)`;
  }

  function figurePoint(event) {
    const meta = page.meta;
    const canvas = page.nodes.canvas;
    if (!meta || !canvas.clientWidth) return null;
    const box = canvas.getBoundingClientRect();
    const height = (meta.bottom ?? meta.height) - (meta.top ?? 0);
    return { x: (event.clientX - box.left) * (meta.width / box.width), y: (meta.top || 0) + (event.clientY - box.top) * (height / box.height) };
  }

  function wireFigure(canvas) {
    let down = false;
    canvas.addEventListener("pointerdown", (event) => {
      const point = figurePoint(event);
      if (!point || event.button > 0) return;
      down = true;
      canvas.classList.add("pointed");                              // focused by the hand: no focus ring (the keyboard's has one)
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* a pointer gone already */ }
      ask("pointer", { kind: "down", x: point.x, y: point.y, touch: event.pointerType !== "mouse" });
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" && !down) return;
      const point = figurePoint(event);
      if (point) ask("pointer", { kind: "move", x: point.x, y: point.y, touch: event.pointerType !== "mouse" }, { transient: true, group: "move" });
    });
    const up = (event) => {
      if (!down) return;
      down = false;
      const point = figurePoint(event) || { x: 0, y: 0 };
      ask("pointer", { kind: "up", x: point.x, y: point.y, touch: event.pointerType !== "mouse" });
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !down) ask("pointer", { kind: "leave", touch: false }, { transient: true, group: "move" });
    });
    canvas.addEventListener("keydown", (event) => {
      canvas.classList.remove("pointed");
      const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Enter: "enter", " ": "space" };
      if (keys[event.key]) {
        event.preventDefault();
        ask("key", { key: keys[event.key] });
      }
    });
  }

  let observer = null, settleTimer = 0;
  function observe(node) {
    if (!window.ResizeObserver) return;
    if (!observer) {
      observer = new ResizeObserver(() => {
        if (page.screen === "bench" && arrangementOf() !== page.layout) {   // turned, and no event said so: built again
          turned();
          return;
        }
        if (page.layout !== "desktop" && page.screen === "bench") {    // a phone: once the screen settles (its bars move)
          fold(page.nodes.metrics, !page.nodes.stage.classList.contains("beside"));
          fold(page.nodes.dock, false);
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            const settled = page.screen === "bench" && page.layout !== "desktop" && page.meta;
            if (settled && stale()) ask("render", {}, { transient: true, group: "render" });
          }, SETTLE_MS);
          return;
        }
        if (page.screen === "bench" && page.meta && stale()) ask("render", {}, { transient: true, group: "render" });
      });
    }
    observer.observe(node);
  }

  // The phone turned (or the window resized into another arrangement): the bench is built again. A phone's browser may
  // say so by orientationchange or by the media query alone, without a resize (the emulator does).
  function turned() {
    if (page.screen === "bench") fitSegments();                    // the column's or the dock's width may have changed
    if (page.screen === "cover") {                                  // the cover composed again for the new size, once a frame
      cancelAnimationFrame(coverFrame);
      coverFrame = requestAnimationFrame(arrangeCover);
    }
    if (page.view) drawBar(page.view);                              // drawn again only if the arrangement changed it
    if (page.screen === "bench" && arrangementOf() !== page.layout) {
      page.signature = null;
      ask("render", {}, { transient: true, group: "render" });
    }
  }
  window.addEventListener("resize", turned);
  window.addEventListener("orientationchange", turned);
  if (window.matchMedia) {
    const held = matchMedia("(orientation: portrait)");
    if (held.addEventListener) held.addEventListener("change", turned);
    else if (held.addListener) held.addListener(turned);
  }

  // ---------------------------------------------------------------- View code (gui/widgets.CodePanel)
  function closeCode() {
    page.codeShown = null;
    page.codeReadingKey = null;
    document.body.classList.remove("code-open");
  }

  function drawCode(code) {
    const panel = page.nodes.code;
    if (!panel) return;
    if (!code.open || !code.reading) {
      panel.hidden = true;
      page.codeShown = null;
      document.body.classList.remove("code-open");
      return;
    }
    if (!page.codeData) {
      fetch("code.json?v=" + BUILD).then((response) => response.json()).then((data) => {
        page.codeData = data;
        if (page.view && page.view.bench) drawCode(page.view.bench.code);
      }, (error) => showError(String(error)));
      return;
    }
    const reading = page.codeData.readings[code.reading];
    if (!reading) return;
    if (page.codeReadingKey !== code.reading) {
      page.codeReadingKey = code.reading;
      page.codeFunction = 0;
    }
    const shown = code.reading + "|" + language + "|" + page.codeFunction;
    if (page.codeShown !== shown) {
      panel.replaceChildren(codeBody(reading));
      page.codeShown = shown;
    }
    panel.hidden = false;
    panel.classList.toggle("beside", codeBeside());
    document.body.classList.add("code-open");
  }

  function codeBody(reading) {
    const index = Math.min(page.codeFunction, reading.functions.length - 1);
    const fn = reading.functions[index];
    const close = el("button", { class: "code-close", type: "button", "aria-label": text("panel.close"),
                                 onclick: () => ask("code", { open: false }) }, icon("close"));
    setTip(close, text("panel.close"));
    const head = el("div", { class: "code-head" }, icon("book"), el("span", { class: "code-chip" }, text("panel.python")),
                    el("h3", { class: "code-title" }, reading.title[language] || reading.title.en), close);
    const body = el("div", { class: "code-body" });
    if (reading.functions.length > 1) {
      const select = el("select", { class: "code-functions", "aria-label": text("panel.functions"),
                                    onchange: (event) => { page.codeFunction = Number(event.target.value); drawCode(page.view.bench.code); } });
      setTip(select, text("panel.functions_tip"));
      reading.functions.forEach((each, i) => select.append(el("option", { value: String(i), selected: i === index }, each.name)));
      body.append(el("span", { class: "select-wrap" }, select));    // its arrow drawn (style.css)
    }
    const note = index === 0 ? (reading.note[language] || reading.note.en) : text("panel.related_function");
    if (note) body.append(el("p", { class: "code-note" }, note));
    const source = el("pre", { class: "code-source" });
    const lines = fn.source.split("\n");
    const tokens = {};
    for (const [line, column, length, kind] of fn.tokens) (tokens[line] = tokens[line] || []).push([column, length, kind]);
    const lineNodes = lines.map((line, number) => {
      const node = el("div", { class: "code-line" });
      let at = 0;
      for (const [column, length, kind] of (tokens[number] || []).sort((a, b) => a[0] - b[0])) {
        if (column < at) continue;
        if (column > at) node.append(line.slice(at, column));
        node.append(el("span", { class: "tok-" + kind }, line.slice(column, column + length)));
        at = column + length;
      }
      node.append(line.slice(at) || "​");
      return node;
    });
    source.append(...lineNodes);
    body.append(source);
    if (fn.parts.length) {
      body.append(el("h4", { class: "parts-heading" }, text("panel.parts")));
      for (const part of fn.parts) {
        const row = el("div", { class: "code-part", tabindex: "0" }, el("strong", {}, part.name[language] || part.name.en), " ",
                       el("span", {}, part.text[language] || part.text.en));
        const mark = () => {
          body.querySelectorAll(".code-part.current").forEach((n) => n.classList.remove("current"));
          row.classList.add("current");
          lineNodes.forEach((n, i) => n.classList.toggle("marked", part.lines.includes(i)));
          const first = lineNodes[part.lines[0]];
          if (first) first.scrollIntoView({ block: "nearest", inline: "nearest" });
        };
        row.addEventListener("pointerenter", mark);
        row.addEventListener("focus", mark);
        row.addEventListener("click", mark);
        body.append(row);
      }
    }
    body.append(el("p", { class: "code-location" }, fn.location));
    const reference = reading.reference[language] || reading.reference.en;
    if (reference) body.append(el("p", { class: "code-reference" }, reference));
    return el("div", { class: "code-inner" }, head, body);
  }

  // ---------------------------------------------------------------- tooltips (tap to show on a touch screen)
  const tip = document.getElementById("tip");
  let tipTimer = 0, tipOwner = null, pointerAt = null, touchedAt = -Infinity;
  let press = null;                      // a touch resting on what has a tooltip: {node, x, y, timer, shown}
  let tap = null;                        // a touch on a measure or the foot's line: {node, x, y, owned}, its tip on release
  const NO_PRESS = "canvas, input, select, textarea";               // their own gestures: the figure's, a slider's, a field's paste
  const moved = (at, event) => Math.hypot(event.clientX - at.x, event.clientY - at.y) > 10;
  document.addEventListener("pointermove", (event) => {
    pointerAt = { x: event.clientX, y: event.clientY };
    if (press && moved(press, event)) {                             // a drag: no tooltip, and the one shown goes
      const shown = press.shown;
      endPress();
      if (shown) hideTip();
    }
    if (tap && moved(tap, event)) tap = null;                       // a swipe along the measures is not a tap
  }, { passive: true, capture: true });

  function endPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function startPress(event) {                                      // a long press shows the tooltip (touch has no hover)
    endPress();
    if (event.pointerType === "mouse" || !event.target.closest || event.target.closest(NO_PRESS)) return;
    const node = event.target.closest("[data-tip]");
    if (!node) return;
    const at = { node, x: event.clientX, y: event.clientY, shown: false };
    at.timer = setTimeout(() => {
      if (press !== at || !node.isConnected) return;
      pointerAt = { x: at.x, y: at.y };
      showTipOf(node);
      at.shown = true;
    }, LONG_PRESS);
    press = at;
  }

  function released(event) {                                        // the finger lifted: a long press's tip goes, and the
    const at = press;                                               // click that ends it does nothing; a tap shows a
    endPress();                                                     // measure's tip, or hides it if it was shown
    const touched = tap;
    tap = null;
    if (at && at.shown) {
      hideTip();
      const swallow = (click) => { click.preventDefault(); click.stopPropagation(); };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 400);
      return;
    }
    if (touched && event.type === "pointerup" && touched.node.isConnected) {
      if (touched.owned) hideTip();
      else { pointerAt = { x: touched.x, y: touched.y }; showTipOf(touched.node); }
    }
  }
  document.addEventListener("pointerup", released, true);
  document.addEventListener("pointercancel", released, true);
  document.addEventListener("contextmenu", (event) => { if (press) event.preventDefault(); }, true);

  function showTipOf(node) {
    const words = node && node.dataset.tip;
    if (!words) return;
    tipOwner = node;
    tip.textContent = words;
    tip.hidden = false;
    let box = node.getBoundingClientRect();
    if (box.height > 120 && pointerAt) box = { left: pointerAt.x - 1, right: pointerAt.x + 1, top: pointerAt.y - 12, bottom: pointerAt.y + 14, width: 2, height: 26 };
    const width = Math.min(340, window.innerWidth - 16);
    tip.style.maxWidth = width + "px";
    const room = tip.getBoundingClientRect();
    let left = Math.min(Math.max(8, box.left + box.width / 2 - room.width / 2), window.innerWidth - room.width - 8);
    let top = box.bottom + 8;
    if (top + room.height > window.innerHeight - 8) top = Math.max(8, box.top - room.height - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tip.hidden = true;
    tipOwner = null;
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const node = event.target.closest && event.target.closest("[data-tip]");
    clearTimeout(tipTimer);
    if (!node) { hideTip(); return; }
    if (node === tipOwner) return;
    tip.hidden = true;
    tipTimer = setTimeout(() => showTipOf(node), TIP_DELAY);
  });
  document.addEventListener("pointerdown", (event) => {
    const node = event.target.closest && event.target.closest("[data-tap='tip']");
    if (event.pointerType !== "mouse") touchedAt = performance.now();
    if (event.pointerType !== "mouse" && node) {
      endPress();
      tap = { node, x: event.clientX, y: event.clientY, owned: tipOwner === node };
      return;
    }
    tap = null;
    if (!tip.contains(event.target)) hideTip();
    startPress(event);
  }, true);
  document.addEventListener("focusin", (event) => {                 // a field focused by a finger says nothing over the keyboard
    const node = event.target.closest && event.target.closest("[data-tip]");
    if (node && node.matches(":focus-visible") && performance.now() - touchedAt > 800) showTipOf(node);
    else hideTip();
  });
  document.addEventListener("scroll", () => { hideTip(); endPress(); }, true);

  // ---------------------------------------------------------------- the keys of the window
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTip();
    if (event.key === "Escape" && page.nodes.sheet && !page.nodes.sheet.hidden) { openSheet(false); page.nodes.info.focus(); return; }
    const typing = event.target.closest && event.target.closest("input, select, textarea");
    if (!page.view || typing) return;
    if (event.altKey && event.key === "Home") { event.preventDefault(); ask("home"); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (page.view.screen === "bench" && /^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const pill = page.view.bench.pills[index];
      if (pill && pill.state !== "locked" && pill.state !== "current") ask("step", { index });
    } else if (page.view.screen === "cover") {
      const cards = [...document.querySelectorAll(".bench-card")];
      if (/^[1-9]$/.test(event.key) && cards[Number(event.key) - 1]) cards[Number(event.key) - 1].click();
      const at = cards.indexOf(document.activeElement);
      if (at >= 0 && (event.key === "ArrowDown" || event.key === "ArrowRight")) { event.preventDefault(); cards[Math.min(at + 1, cards.length - 1)].focus(); }
      if (at >= 0 && (event.key === "ArrowUp" || event.key === "ArrowLeft")) { event.preventDefault(); cards[Math.max(at - 1, 0)].focus(); }
    }
  });

  // ---------------------------------------------------------------- errors
  function showError(details) {
    const toast = document.getElementById("toast");
    const close = el("button", { class: "quiet-button", type: "button", onclick: () => { toast.hidden = true; } }, text("web.error.close"));
    toast.replaceChildren(el("strong", {}, text("web.error.title")), el("pre", {}, details), close);
    toast.hidden = false;
    console.error(details);
  }

  // ---------------------------------------------------------------- the start
  fetch("texts.json?v=" + BUILD).then((response) => response.json()).then((data) => {
    catalogs = data;
    const kept = load();                                            // the address's language first, as boot does, then the one kept
    const asked = new URLSearchParams(location.search).get("lang");
    language = asked === "en" || asked === "pt_BR" ? asked : kept.language === "en" || kept.language === "pt_BR" ? kept.language : browserLanguage();
    document.documentElement.lang = language === "pt_BR" ? "pt-BR" : "en";
    start();
  }, (error) => {
    const box = document.getElementById("loading-error");               // no catalog yet: the error as it came
    box.textContent = String(error);
    box.hidden = false;
  });
})();
