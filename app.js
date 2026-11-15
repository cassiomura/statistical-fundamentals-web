/*
 * Statistical Fundamentals, the web version: the page. It shows what the laboratory in Python computes (worker.js runs
 * web/bridge.py in Pyodide) and sends it what the reader does; it computes nothing of the study itself.
 *
 *   the cover     the three benches on one thread, the Student | Teacher switch, the bar (share, sound, language)
 *   a bench       the bar (Home, the bench's name and stars, the pills of its steps), the column of the step's
 *                 controls, the figure (drawn by the lab in Python, as RGBA pixels), the strip of measures, View code
 *
 * The requests go one at a time to the worker, in order; a request that only refreshes (the pointer moving, the page
 * resized) replaces the one of its kind still waiting: the latest wins, so dragging on a phone stays usable. Each
 * answer is the whole view, which the page draws: the column is built once per step and language and then updated in
 * place (a slider being dragged, a field being typed in are never rebuilt under the hand).
 *
 * Three arrangements: the desktop's workbench (the column at the left, the figure on all the room left, the strip at
 * its foot); a short or narrow window (a phone in landscape: a narrower column that folds away); a phone in portrait
 * (the figure first, one panel at a time when the lab stacks them, the strip as a grid, the controls under it and the
 * filled button pinned at the bottom). Every text comes from the catalogs (texts.json); what is kept between visits
 * (the language, the mode, the student's stars, the sound) is in localStorage.
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
  const BUSY_AFTER = 300;                // milliseconds a request may take before the page says it is computing
  const TIP_DELAY = 450;                 // milliseconds the pointer rests before a tooltip shows
  const COLUMN = 312, COLUMN_NARROW = 264, STAGE_INSETS = [20, 10, 20, 0], STAGE_GAP = 4;   // gui/lab_views
  const STACK_WIDTH = 620;               // explorers/panels.STACK_WIDTH: a narrower figure stacks its panels
  const CODE_SIDE = 1200;                // the code panel beside the bench from this width (gui/main_window.SIDE_BY_SIDE_WIDTH)
  const QR_LIBRARY = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
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
  function loadingTexts() {
    document.getElementById("loading-title").textContent = text("web.loading.title");
    document.getElementById("loading-note").textContent = text("web.loading.note");
  }

  function progress(stage, fraction) {
    document.getElementById("loading-stage").textContent = text("web.loading." + stage);
    document.getElementById("loading-fill").style.width = Math.round(100 * fraction) + "%";
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
    view: null, screen: null, layout: null, signature: null, panel: "plane", collapsed: false, meta: null,
    nodes: {}, codeFunction: 0, codeShown: null, codeReadingKey: null, codeData: null, needImage: true,
  };

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
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const nodes = page.nodes;
    if (page.screen !== "bench" || !nodes.stage || !nodes.stage.isConnected) {
      return estimateSize(ratio);
    }
    if (page.layout === "portrait") {
      return { width: nodes.figureBox.clientWidth || (window.innerWidth - 24), height: null, ratio, panel: page.panel };
    }
    const style = getComputedStyle(nodes.stage);
    const width = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (page.layout === "compact" && width < STACK_WIDTH) {
      return { width: Math.max(width, 120), height: null, ratio, panel: page.panel };    // stacked: one panel at a time
    }
    const height = nodes.stage.clientHeight - parseFloat(style.paddingTop) - nodes.strip.offsetHeight - STAGE_GAP;
    return { width: Math.max(width, 120), height: Math.max(height, 200), ratio };
  }

  function estimateSize(ratio) {
    const layout = arrangementOf();
    const bar = 49, strip = 56;                                     // the bar and the strip of two lines, as they come
    if (layout === "portrait") return { width: window.innerWidth - 24, height: null, ratio, panel: page.panel };
    const column = layout === "desktop" ? COLUMN : (page.collapsed ? 0 : COLUMN_NARROW);
    const code = page.view && page.view.bench && page.view.bench.code.open && window.innerWidth >= CODE_SIDE ? 560 : 0;
    return { width: Math.max(window.innerWidth - column - code - 40, 120), height: Math.max(window.innerHeight - bar - STAGE_INSETS[1] - strip, 200), ratio };
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
  function languageBox(view) {
    const box = el("select", { class: "language", "aria-label": view.bar.language, title: view.bar.language,
                               onchange: (event) => ask("language", { language: event.target.value }) });
    for (const [code, name] of view.languages) {
      box.append(el("option", { value: code, selected: code === view.language }, name));
    }
    return box;
  }

  function soundButton(view) {
    const label = sound.enabled ? view.bar.sound_off : view.bar.sound_on;
    const button = el("button", { class: "bar-icon", type: "button", "aria-label": label, "aria-pressed": String(sound.enabled),
                                  onclick: () => { sound.toggle(); drawBar(page.view); } },
                      icon(sound.enabled ? "sound_on" : "sound_off"));
    setTip(button, label);
    return button;
  }

  function drawBar(view) {
    const bar = document.getElementById("bar");
    bar.replaceChildren();
    if (view.screen === "cover") {
      bar.append(el("div", { class: "brand" }, el("img", { src: "icons/app.svg", alt: "", width: 20, height: 20 }),
                    el("span", { class: "bar-name" }, view.bar.app)));
      bar.append(el("div", { class: "bar-spring" }));
      const share = el("button", { class: "bar-icon share", type: "button", "aria-label": text("web.share"), onclick: openShare },
                       el("span", { class: "qr-glyph", "aria-hidden": "true" }));
      setTip(share, text("web.share_tip"));
      bar.append(share);
    } else {
      const bench = view.bench;
      const home = el("button", { class: "home", type: "button", "aria-label": view.bar.home, onclick: () => ask("home") },
                      el("img", { src: "icons/app.svg", alt: "", width: 18, height: 18 }), el("span", { class: "home-word" }, view.bar.home));
      setTip(home, view.bar.home_tip);
      bar.append(home);
      const name = el("span", { class: "bar-name bench-name", "aria-label": bench.name }, bench.name);
      if (bench.stars) name.append(el("span", { class: "stars", "aria-label": bench.stars_text }, stars(bench.stars, view.most)));
      bar.append(name);
      bar.append(el("div", { class: "bar-spring" }));
      const pills = el("nav", { class: "pills", "aria-label": view.bar.steps });
      bench.pills.forEach((pill, index) => {
        if (index) pills.append(el("span", { class: "connector" + (bench.pills[index - 1].state === "done" ? " lit" : ""), "aria-hidden": "true" }));
        const locked = pill.state === "locked";
        const button = el("button", { class: "pill " + pill.state, type: "button", "aria-current": pill.state === "current" ? "step" : null,
                                      "aria-disabled": locked ? "true" : null, "aria-label": pill.tip.split("\n")[0],
                                      onclick: () => { if (!locked) ask("step", { index }); else showTipOf(button); } },
                          el("span", { class: "pill-mark" }, pill.state === "done" ? "✓" : locked ? icon("padlock", "small") : String(index + 1)),
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

  function stars(count, most) {
    return "★".repeat(count) + "☆".repeat(Math.max(most - count, 0));
  }

  // ---------------------------------------------------------------- the cover
  function drawCover(view) {
    const screen = document.getElementById("screen");
    page.screen = "cover";
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
    const lede = el("section", { class: "lede" }, switcher, el("p", { class: "mode-line" }, cover.mode_line),
                    el("p", { class: "purpose" }, cover.purpose), el("h1", { class: "cover-title" }, cover.title),
                    el("p", { class: "lead" }, cover.lead), restart);
    const journey = el("ol", { class: "journey" });
    cover.cards.forEach((card) => journey.append(coverCard(card)));
    const body = el("div", { class: "cover" }, lede, journey);
    screen.replaceChildren(body);
    const last = journey.querySelector(`[data-bench="${cover.last}"]`);
    if (last && document.activeElement === document.body) last.focus({ preventScroll: true });
  }

  function coverCard(card) {
    const picture = coverPicture(card.picture);
    const name = el("div", { class: "card-name" }, el("span", {}, card.title));
    if (card.stars) name.append(el("span", { class: "stars", "aria-label": card.stars_text }, stars(card.stars, 3)));
    const track = el("ol", { class: "track" });
    card.track.forEach((stop, index) => {
      if (index) track.append(el("li", { class: "track-line " + (card.track[index - 1].state === "done" ? "lit" : ""), "aria-hidden": "true" }));
      const worth = stop.worth ? el("span", { class: "track-worth kind-" + stop.worth[1] }, stop.worth[0]) : null;
      track.append(el("li", { class: "stop " + stop.state, "aria-label": stop.tip },
                      el("span", { class: "stop-mark", "aria-hidden": "true" }, stop.state === "done" ? "✓" : ""),
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
    dialog.replaceChildren(el("h2", {}, words.title), el("p", {}, words.text), el("div", { class: "dialog-row" }, confirm, cancel));
    dialog.showModal();
    cancel.focus();
  }

  // ---------------------------------------------------------------- share: a QR code of this page
  let qrLoading = null;
  function qrLibrary() {
    if (window.QRCode) return Promise.resolve();
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const script = el("script", { src: QR_LIBRARY, crossorigin: "anonymous", referrerpolicy: "no-referrer" });
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
                       bench.lab.controls.map((c) => c.key + ":" + c.kind).join(","), page.collapsed].join("|");
    let built = false;
    if (page.screen !== "bench" || signature !== page.signature) {
      page.layout = layout;
      buildBench(view);
      page.signature = signature;
      page.screen = "bench";
      built = true;
    }
    updateBench(view);
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
    if (now.ratio !== asked.ratio || (now.panel || null) !== (asked.panel || null) || Math.abs(now.width - meta.width) > 1) return true;
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
    const head = el("div", { class: "column-head" }, title, el("div", { class: "card-slot" }, nodes.card), el("div", { class: "rule" }));
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
      body.append(el("div", { class: "transport" }, icons, nodes.stageName));
    }
    const chips = el("div", { class: "chips" });
    for (const action of lab.chips) {
      const button = el("button", { class: "chip", type: "button", onclick: () => ask("action", { key: action.key }) });
      nodes.commands[action.key] = { button, kind: "chip" };
      chips.append(button);
    }
    body.append(chips);
    nodes.status = el("p", { class: "status", role: "status" });
    nodes.missing = el("p", { class: "missing" });
    nodes.filled = null;
    const foot = el("div", { class: "column-foot" }, nodes.status, nodes.missing);
    if (lab.filled) {
      nodes.filled = el("button", { class: "filled", type: "button", onclick: () => {
        const filled = page.view.bench.lab.filled;
        if (filled && filled.enabled) ask("action", { key: filled.key });
        else showTipOf(nodes.filled);
      } });
      foot.append(nodes.filled);
    }
    nodes.restore = el("button", { class: "restore", type: "button", onclick: () => ask("restore") }, icon("reset", "small"), el("span", {}, lab.restore.label));
    setTip(nodes.restore, lab.restore.tip);
    if (!lab.restore.shown) nodes.restore.hidden = true;
    foot.append(nodes.restore);
    const column = el("aside", { class: "column" }, head, body, foot);
    nodes.column = column;

    nodes.panels = el("div", { class: "segmented panel-switch", role: "tablist", "aria-label": text("web.panels"), hidden: true });
    nodes.canvas = el("canvas", { class: "figure", tabindex: "0", role: "img" });
    nodes.alert = el("div", { class: "alert", hidden: true });
    nodes.busy = el("div", { class: "busy-note", "aria-hidden": "true" }, text("web.busy"));
    nodes.figureBox = el("div", { class: "figure-box" }, nodes.canvas, nodes.alert, nodes.busy);
    nodes.metrics = el("div", { class: "metrics" });
    nodes.links = el("div", { class: "strip-end" });
    for (const link of lab.links) {
      const button = el("button", { class: "link", type: "button", onclick: () => ask("action", { key: link.key }) }, link.label);
      setTip(button, link.tip);
      nodes.links.append(button);
    }
    nodes.strip = el("div", { class: "strip" }, nodes.metrics, nodes.links);
    nodes.table = el("div", { class: "lab-table", hidden: true });
    nodes.stage = el("section", { class: "stage" }, nodes.panels, nodes.figureBox, nodes.strip, nodes.table);
    nodes.code = el("aside", { class: "code-panel", hidden: true });
    const toggle = el("button", { class: "column-toggle", type: "button", onclick: () => { page.collapsed = !page.collapsed; page.signature = null; drawBench(page.view); } },
                      page.collapsed ? "›" : "‹");
    toggle.setAttribute("aria-label", text(page.collapsed ? "web.column.show" : "web.column.hide"));
    setTip(toggle, text(page.collapsed ? "web.column.show" : "web.column.hide"));
    const benchNode = el("div", { class: `bench ${page.layout}` + (page.collapsed && page.layout === "compact" ? " collapsed" : "") },
                         column, nodes.stage, nodes.code);
    if (page.layout === "compact") benchNode.append(toggle);
    document.getElementById("screen").replaceChildren(benchNode);
    nodes.bench = benchNode;
    wireFigure(nodes.canvas);
    observe(nodes.stage);
    observe(nodes.strip);
  }

  function featuredButton(action) {
    const label = el("span", { class: "featured-title" });
    const detail = el("span", { class: "featured-detail" });
    const button = el("button", { class: "featured", type: "button", onclick: () => ask("action", { key: action.key }) }, label, detail);
    page.nodes.commands[action.key] = { button, kind: "featured", label, detail };
    return button;
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
      parts.buttons = control.names.map((name, index) => {
        const button = el("button", { class: "segment", type: "button", role: "radio", onclick: () => {
          const now = page.nodes.controls[control.key].last;
          if (now && now.locked[index]) showTipOf(button);
          else ask("control", { key: control.key, value: index });
        } }, el("span", { class: "segment-lock" }), name);
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
      const line = el("div", { class: "typed-line" }, el("span", { class: "symbol" }, control.symbol), parts.input);
      if (control.shortcuts) {
        parts.picks = el("div", { class: "segmented picks" });
        parts.pickButtons = control.shortcuts.map((pick, index) => {
          const button = el("button", { class: "segment", type: "button", onclick: () => ask("pick", { key: control.key, index }) }, pick.text);
          setTip(button, pick.tip);
          parts.picks.append(button);
          return button;
        });
        line.append(parts.picks);
      }
      group.append(line);
    } else {
      group.append(el("div", { class: "control-label" }, control.label));
      parts.value = el("span", { class: "slider-value" });
      parts.input = el("input", { class: "slider", type: "range", min: "0", step: "1", "aria-label": control.label });
      setTip(parts.input, control.shortcuts ? control.fine_tip : "");
      parts.input.addEventListener("input", (event) => ask("control", { key: control.key, value: Number(event.target.value) },
                                                          { transient: true, group: "slider:" + control.key }));
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

  function valueText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function commitTyped(key, input) {
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
    for (const action of [...lab.featured, ...lab.transport, ...lab.chips]) updateCommand(action);
    if (nodes.stageName) {
      nodes.stageName.textContent = lab.stage;
      setTip(nodes.stageName, lab.stage);
    }
    nodes.status.textContent = lab.status;
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
      button.textContent = action.label;
      setTip(button, action.tip);
    }
  }

  function metric(item) {
    const title = el("div", { class: "metric-title" });
    if (item.color) title.append(el("span", { class: "metric-dot", style: "color:" + item.color }, "●"));
    title.append(el("span", { html: item.title }));
    const line = el("div", { class: "metric-line" }, el("span", { class: "metric-value kind-" + item.kind, html: item.value }));
    if (item.detail) line.append(el("span", { class: "metric-detail kind-" + item.detail_kind, html: item.detail }));
    const node = el("div", { class: "metric", tabindex: "0", dataset: { tap: "tip" } }, title, line);
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
    const height = (meta.bottom ?? meta.height) - (meta.top ?? 0);
    nodes.figureBox.style.height = height + "px";
    if (page.layout !== "portrait") nodes.figureBox.style.width = meta.width + "px";
    else nodes.figureBox.style.width = "";
    const canvas = nodes.canvas;
    canvas.style.width = meta.width + "px";
    canvas.style.height = height + "px";
    if (pixels && meta.pixel_width) {
      if (canvas.width !== meta.pixel_width) canvas.width = meta.pixel_width;
      if (canvas.height !== meta.pixel_height) canvas.height = meta.pixel_height;
      const context = canvas.getContext("2d");
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), meta.pixel_width, meta.pixel_height), 0, 0);
    }
    const panels = meta.panels || [];
    const switching = panels.length > 0 && (page.layout === "portrait" || page.asked && page.asked.height === null);
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
      const keys = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Enter: "enter", " ": "space" };
      if (keys[event.key]) {
        event.preventDefault();
        ask("key", { key: keys[event.key] });
      }
    });
  }

  let observer = null;
  function observe(node) {
    if (!window.ResizeObserver) return;
    if (!observer) {
      observer = new ResizeObserver(() => {
        if (page.screen === "bench" && page.meta && stale()) ask("render", {}, { transient: true, group: "render" });
      });
    }
    observer.observe(node);
  }

  window.addEventListener("resize", () => {
    if (page.screen === "bench" && arrangementOf() !== page.layout) {
      page.signature = null;
      ask("render", {}, { transient: true, group: "render" });
    }
  });

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
                                 onclick: () => ask("code", { open: false }) }, text("panel.close_mark"));
    setTip(close, text("panel.close"));
    const head = el("div", { class: "code-head" }, icon("book"), el("span", { class: "code-chip" }, text("panel.python")),
                    el("h3", { class: "code-title" }, reading.title[language] || reading.title.en), close);
    const body = el("div", { class: "code-body" });
    if (reading.functions.length > 1) {
      const select = el("select", { class: "code-functions", "aria-label": text("panel.functions"),
                                    onchange: (event) => { page.codeFunction = Number(event.target.value); drawCode(page.view.bench.code); } });
      setTip(select, text("panel.functions_tip"));
      reading.functions.forEach((each, i) => select.append(el("option", { value: String(i), selected: i === index }, each.name)));
      body.append(select);
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
  let tipTimer = 0, tipOwner = null, pointerAt = null;
  document.addEventListener("pointermove", (event) => { pointerAt = { x: event.clientX, y: event.clientY }; }, { passive: true });

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
    if (event.pointerType !== "mouse" && node) {
      if (tipOwner === node) hideTip(); else showTipOf(node);
      return;
    }
    if (!tip.contains(event.target)) hideTip();
  }, true);
  document.addEventListener("focusin", (event) => {
    const node = event.target.closest && event.target.closest("[data-tip]");
    if (node && node.matches(":focus-visible")) showTipOf(node);
    else hideTip();
  });
  document.addEventListener("scroll", hideTip, true);

  // ---------------------------------------------------------------- the keys of the window
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideTip();
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
    const kept = load();
    language = kept.language === "en" || kept.language === "pt_BR" ? kept.language : browserLanguage();
    document.documentElement.lang = language === "pt_BR" ? "pt-BR" : "en";
    start();
  }, (error) => {
    document.getElementById("loading-stage").textContent = String(error);
  });
})();
