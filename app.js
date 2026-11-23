/*
 * Statistical Fundamentals, the web version: the page. It shows what the laboratory in Python computes (worker.js runs
 * web/bridge.py in Pyodide) and sends it what the reader does; it computes nothing of the study itself.
 *
 *   the cover     the four benches on one thread, the Student | Teacher switch, the bar (share, sound, language);
 *                 in a desktop's window placed by gui/cover.py's numbers (arrangeCover, its page's air tightened where
 *                 the cards would not hold the first screen: PAGE_TIGHT), larger past full HD; a passed card's check
 *                 after its name, the bench's facts under it (inputs, objectives, constraints); the title's column in
 *                 its own order, on purpose: the version's mark, title, lead, then the switch (the desktop puts the
 *                 switch first; a visitor of the site reads what it is before choosing a mode)
 *   a bench       the bar (Home, the bench's name and its check once passed, the pills of its steps), the column of the
 *                 step's controls and its blocks, the figure (drawn by the lab in Python, as RGBA pixels), View code
 *
 * The requests go one at a time to the worker, in order; a request that only refreshes (the pointer moving, the page
 * resized) replaces the one of its kind still waiting: the latest wins, so dragging on a phone stays usable. Each
 * answer is the whole view, which the page draws: the column is built once per step and language and then updated in
 * place (a slider being dragged, a field being typed in are never rebuilt under the hand).
 *
 * Three arrangements: the desktop's workbench, columned as the window (gui/lab_views.LabView: the column at the left, its
 * title, the card's slot sized per bench, the rule, the controls, the step's BLOCKS between the controls and the foot
 * (each a small figure the lab draws, shown pixel for pixel), the foot with the status line, the filled command and
 * Restore beside View code; the figure on all the room left, with no strip, the view's band of a bench of more than two
 * inputs over it and "Show f" on it: the figure asked at the stage's whole size, its box reserved before it comes, shown
 * one pixel drawn to one pixel of the screen and moved onto the screen's pixel grid; the busy note in the bar, never over
 * the figure); and a phone, one screen that never scrolls as a page, in portrait (phoneBench: the bar on one row, the
 * panel switch with the card's "i" and View code, the figure, the measures on one line, the dock, the foot) or in
 * landscape and any short or narrow window (landscapeBench: the column at the left, the switch in the bar, the figure
 * fitted to the stage's height with the measures at its side or under it). On a phone the figure is one panel at a time
 * in a box of one size: the page gives the box's room (`fit`) and the bridge draws each panel as wide as IT fits; the
 * controls are a dense dock, the only scroller, the card a sheet over it; the foot is one row (the filled button,
 * Restore) and its line says something over the dock's edge only when there is something to say. On a touch screen a
 * long press shows the tooltip of what is pressed (never a slider's or a field's; the figure has none), a tap that of a
 * measure or of the foot's line.
 * No grey line stands anywhere: why the filled command cannot be pressed is its tooltip, what a verdict lacks the status
 * line's. Every text comes from the catalogs (texts.json); what is kept between visits (the language, the mode, the
 * benches a student passed, the sound) is in localStorage.
 */
"use strict";
(() => {
  const BUILD = document.body.dataset.build;
  const STORE = "statistical-fundamentals";
  const SOUNDS = {                       // gui/sounds.SOUNDS: cue -> [its length in seconds, its priority]
    navigate: [0.14, 1], advance: [0.26, 2], apply: [0.08, 1], place: [0.07, 1], remove: [0.08, 1], sample: [0.20, 1],
    complete: [0.36, 2], discard: [0.16, 2], reveal: [0.30, 2], unlock: [0.40, 2],
    passed: [0.38, 3], missed: [0.34, 3], achieved: [0.50, 3],
  };
  const THROTTLE = 0.25;                 // seconds: gui/sounds.THROTTLE
  const TYPING_MS = 350;                 // gui/widgets.NumberField.TYPING_MS: a pause in the typing commits a number in range
  const BUSY_AFTER = 300;                // milliseconds a request may take before the page says it is computing
  const TIP_DELAY = 600;                 // milliseconds the pointer rests before a tooltip shows
  const TIP_WIDTH = 260;                 // pixels: the widest a tooltip grows (one short sentence, a short box)
  const TIP_AGAIN = 400;                 // milliseconds: a tooltip closed this recently, the next one shows at once (a toolbar)
  const TIP_GRACE = 300;                 // milliseconds the tooltip shown waits for the pointer crossing towards it
  const MOST_RATIO = 2;                  // bridge.MOST_RATIO: a denser screen is drawn at 2 and scaled by the browser
  const COLUMN = 312, STAGE_INSETS = [20, 10, 20, 0], STAGE_GAP = 4;   // gui/lab_views
  const CODE_SIDE = 1200;                // the code panel beside the bench from this width (gui/main_window.SIDE_BY_SIDE_WIDTH)
  // beside the bench, the code panel is at most CODE_MOST (and 42 % of the window) wide, and never so wide that the
  // stage keeps less than STACK_WIDTH for its figure (explorers/panels.STACK_WIDTH: narrower, the labs stack the three
  // panels, a figure twice as tall as the stage, which then scrolled the measures' strip off the screen); a panel that
  // would be narrower than CODE_LEAST lies over the bench instead, as under CODE_SIDE
  const CODE_MOST = 560, CODE_LEAST = 380, STACK_WIDTH = 620;
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
  const COVER_TIGHT = 12;                // gui/cover.PAGE_TIGHT: the page's air above and below where the cards would not hold
  const SMALL_DOT = 1.5 * 3.0 / 4.4;     // gui/cover's SMALL_DOT of DOT: a design of many in a small picture (Mark.small)
  const BAND_BELOW = 2;                  // gui/lab_views.BAND_BELOW: from the view's band to the figure
  const BAND_MARKS = { across: "axis_across", up: "axis_up" };     // gui/lab_views.BAND_MARKS: the mark before an axis's options
  const BAND_CHIP = "recenter";          // gui/lab_views.BAND_CHIP: the chip that puts the slice back
  const REVEAL_MARK = "eye";             // gui/lab_views.REVEAL_MARK: "Show f"
  const CARD_MARGIN = 12;                // gui/blocks.CARD_MARGINS' left and right: a block's scroll bar stands in the right one
  const SCROLL_WIDTH = 6;                // gui/blocks.SCROLL_WIDTH: the slim scroll bar of a table longer than its block
  const WHEEL_ROW = 33;                  // pixels of the wheel for one row of a block's table (a notch of 100: three rows, as Qt's)

  // ---------------------------------------------------------------- the contract with the bridge
  // The names the page reads from the view and the meta, and the operations it sends, in ONE place (the contract:
  // web/bridge.py's): a name changed over there is changed here alone.
  const WIRE = {
    statusTip: (lab) => lab.status_tip || "",                       // the verdict's reason (Lab.hint), the status line's tooltip
    next: (lab) => lab.next || null,                                // {label, tip}: "Next bench →" or "Back to the cover"
    demoted: (lab) => !!(lab.filled && lab.filled.demoted),        // outlined over "Next bench"
    reveal: (lab) => lab.reveal || null,                            // {offered, checked, label, tip, mark, box: [x, top, w, h] | null}
    blocks: (lab) => lab.blocks || [],                              // [{key, title, note, tip, least, most, live, rows, scroll}]
    slot: (bench) => bench.slot || null,                            // {rows, problem}: the card's slot, the bench's
    onLine: (control) => control.on_line || [],                     // the slim commands on a control's label line
    placed: (action) => action.placed || "",                        // the control whose line holds this chip's copy
    tracking: (control) => control.tracking !== false,              // a slider read at every step (false: on release)
    texts: (control) => control.texts || null,                      // a slider's text at each position (followed in a drag)
    band: (item) => !!item.band,                                    // a control or a chip of the view's band
    blockMeta: (meta) => (meta && meta.blocks) || {},               // {key: {width, height, ratio, same, pixel_width?, pixel_height?}}
    blockPixels: (message) => message.blockPixels || {},            // {key: ArrayBuffer}: the worker's extra transferables
    cursor: (lab) => (lab && lab.cursor) || "",                     // the pointer's shape (ew-resize on the band), the view's
    passed: (item) => !!item.passed,                                // a bench's and a cover card's
    passedText: (item) => item.passed_text || "",
    sizeBlocks: "blocks",                                           // the request's size.blocks = {key: [width, height]}
    op: { onward: "onward", reveal: "reveal", blockPointer: "block_pointer", blockPress: "block_press", blockScroll: "block_scroll" },
  };
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
  function load() {                                                // only a plain object: anything else kept reads as nothing
    try {
      const kept = JSON.parse(localStorage.getItem(STORE) || "{}");
      return kept && typeof kept === "object" && !Array.isArray(kept) ? kept : {};
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
      else if (key === "html") node.innerHTML = value;              // rich text of the bridge's own (catalogs, labs): <sup>
      else if (key === "style") node.style.cssText = value;         // through the CSSOM: the CSP allows no style attribute
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

  // A tooltip, and the same words as the element's accessible description (aria-description), so that a screen reader
  // hears what a pointer reads (a measure is not announced as a bare number); not when they are already its name or text.
  function setTip(node, tip) {
    if (tip) node.dataset.tip = tip;
    else delete node.dataset.tip;
    const said = tip && tip !== node.getAttribute("aria-label") && tip !== node.textContent.trim();
    if (said) node.setAttribute("aria-description", tip);
    else node.removeAttribute("aria-description");
  }

  // ---------------------------------------------------------------- groups of options (the ARIA radio group and tabs)
  // A group of options (the mode, the language, a control's options, a phone's panels) is ONE stop of Tab: its chosen
  // option holds it (tabindex 0, the others -1; the first shown while none is chosen). The arrow keys move along the
  // group and choose what they reach (the pattern's "selection follows focus"); a locked option is reached, not chosen,
  // and says why (its tooltip on the keyboard's focus, its aria-description); Home and End go to the group's ends.
  const OPTION = '[role="radio"], [role="tab"]';
  const GROUP = '[role="radiogroup"], [role="tablist"]';

  function optionsOf(group) {
    return [...group.querySelectorAll(OPTION)].filter((option) => !option.hidden && option.closest(GROUP) === group);
  }

  function rove(group) {
    const options = optionsOf(group);
    const chosen = options.find((option) => option.getAttribute("aria-checked") === "true" || option.getAttribute("aria-selected") === "true");
    for (const option of options) option.tabIndex = option === (chosen || options[0]) ? 0 : -1;
  }

  function refocus(group) {                                          // a group drawn again: the focus back on its chosen option
    const option = group && optionsOf(group).find((each) => each.tabIndex === 0);
    if (option) option.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (event) => {
    const option = event.target.closest && event.target.closest(OPTION);
    const group = option && option.closest(GROUP);
    if (!group || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const options = optionsOf(group);
    const at = options.indexOf(option);
    const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 }[event.key];
    if (to === undefined || at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = options[(to + options.length) % options.length];
    if (next === option) return;
    next.focus({ preventScroll: true });
    if (next.getAttribute("aria-disabled") !== "true") next.click();   // chosen as it is reached; a locked one only says why
  }, true);

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
    const request = Object.assign({ op: item.op }, item.args, { size: figureSize(), force: page.needImage || page.needBlocks });
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
        apply(JSON.parse(message.text), JSON.parse(message.meta || "{}"), message.pixels, done, WIRE.blockPixels(message));
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
    nodes: {}, codeFunction: 0, codeShown: null, codeReadingKey: null, codeData: null, needImage: true, needBlocks: false,
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
      for (const card of Object.values(page.nodes.blockCards || {})) {    // the blocks' figures, put on the grid again too
        if (node.contains(card.canvas) && card.canvas.width) align(card.canvas, true);
      }
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

  function codeWidth() {
    const stage = STACK_WIDTH + STAGE_INSETS[0] + STAGE_INSETS[2];   // the least stage that keeps the figure unstacked
    return Math.floor(Math.min(CODE_MOST, 0.42 * window.innerWidth, window.innerWidth - COLUMN - stage));
  }

  function codeBeside(layout) {
    return window.innerWidth >= CODE_SIDE && (layout || page.layout) === "desktop" && codeWidth() >= CODE_LEAST;
  }

  function figureSize() {
    const ratio = Math.min(window.devicePixelRatio || 1, MOST_RATIO);
    const nodes = page.nodes;
    const now = arrangementOf();
    if (now !== "desktop") return phoneSize(ratio, now);
    if (page.screen !== "bench" || !nodes.stage || !nodes.stage.isConnected || page.layout !== now) {
      return estimateSize(ratio);
    }
    const room = Object.assign(stageRoom(), { ratio });
    const blocks = blockRoom();
    if (blocks) room[WIRE.sizeBlocks] = blocks;
    return room;
  }

  // The desktop's figure takes all the stage's room: its width inside the padding, its height from under the view's band
  // (a bench of more than two inputs) down to the stage's foot: no strip (the step's measures are its blocks'), no cap,
  // no aspect kept (the labs' own plan, explorers/panels.arrangement, composes the panels in whatever room it is given).
  function stageRoom() {
    const nodes = page.nodes;
    const style = getComputedStyle(nodes.stage);
    const width = nodes.stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const band = nodes.band && !nodes.band.hidden                   // its line, BAND_BELOW under it and the stage's gap
      ? nodes.band.offsetHeight + (parseFloat(getComputedStyle(nodes.band).marginBottom) || 0) + STAGE_GAP : 0;
    const height = nodes.stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - band;
    return { width: Math.max(width, 120), height: Math.max(height, 200) };
  }

  function estimateSize(ratio) {
    const bar = 49;                                                 // the bar, as it comes; a band's line where the lab has one
    const lab = page.view && page.view.bench && page.view.bench.lab;
    const band = lab && lab.controls.some(WIRE.band) ? 30 + BAND_BELOW + STAGE_GAP : 0;
    const code = page.view && page.view.bench && page.view.bench.code.open && codeBeside("desktop") ? codeWidth() : 0;
    return { width: Math.max(window.innerWidth - COLUMN - code - 40, 120), height: Math.max(window.innerHeight - bar - STAGE_INSETS[1] - band, 200), ratio };
  }

  // The room of each block's figure on show, in CSS pixels as laid out (gui/blocks.BlockCard: the column's content less
  // the card's margins wide, least to most high); null where there is none.
  function blockRoom() {
    const cards = page.nodes.blockCards;
    if (!cards) return null;
    const room = {};
    for (const [key, card] of Object.entries(cards)) {
      if (card.node.hidden || card.holder.hidden) continue;
      room[key] = [Math.round(card.holder.clientWidth), Math.round(card.holder.clientHeight)];
    }
    return Object.keys(room).length ? room : null;
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
  function apply(view, meta, pixels, done, blockPixels) {
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
    else drawBench(view, meta, pixels, done, blockPixels || {});
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
    rove(box);
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
    const bench = view.bench && { name: view.bench.name, passed: WIRE.passed(view.bench), text: WIRE.passedText(view.bench), pills: view.bench.pills };
    const signature = JSON.stringify([view.screen, view.language, view.languages, view.bar, bench, sound.enabled, phone]);
    if (signature === page.barSignature && bar.childElementCount) return;
    page.barSignature = signature;
    const focused = document.activeElement;                          // an option of the language chosen by the arrows: the
    const inLanguage = focused && bar.contains(focused) && !!focused.closest(".language");   // focus stays in the switch
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
      bar.append(name);
      if (WIRE.passed(bench)) bar.append(passMark(WIRE.passedText(bench)));   // step_bar.PassMark: beside the bench's name
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
    if (inLanguage) refocus(bar.querySelector(".language"));
  }

  // The check of a bench passed (gui/step_bar.PassMark, paint_badge): the check of a step done in its green disc, an
  // image named and explained by "Bench complete" (no focus: not a command).
  function passMark(said) {
    const mark = el("span", { class: "pass-mark", role: "img", "aria-label": said }, icon("check"));
    setTip(mark, said);
    return mark;
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
    const focused = document.activeElement;                          // the mode chosen by the arrows: the focus stays on the switch
    const inSwitch = !!(focused && focused.closest && focused.closest(".mode-switch"));
    const switcher = el("div", { class: "segmented mode-switch", role: "radiogroup", "aria-label": cover.mode_label });
    for (const mode of cover.modes) {
      switcher.append(el("button", { class: "segment" + (mode.key === view.mode ? " checked" : ""), type: "button", role: "radio",
                                     "aria-checked": String(mode.key === view.mode),
                                     onclick: () => { if (mode.key !== page.view.mode) ask("mode", { mode: mode.key }); } }, mode.name));
    }
    rove(switcher);
    setTip(switcher, cover.mode_line);                               // what the mode means: its tooltip, no grey line (D5)
    const restart = el("button", { class: "quiet-button restart", type: "button", onclick: confirmRestart,
                                   style: cover.restart ? null : "visibility:hidden" }, cover.restart_texts.command);
    setTip(restart, cover.restart_texts.tip);
    // the version's mark over the title: a label, not a control; the version as the build computed it, never typed in a text
    const edition = el("p", { class: "edition" }, el("span", { class: "edition-name" }, cover.edition), " ",
                       el("span", { class: "edition-version" }, cover.version || document.body.dataset.version));
    const lede = el("section", { class: "lede" }, edition, el("h1", { class: "cover-title" }, cover.title),
                    el("p", { class: "lead" }, cover.lead), switcher, restart);
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
    if (inSwitch) refocus(switcher);
    else if (last && document.activeElement === document.body) last.focus({ preventScroll: true });
  }

  // The cover composed for the screen it is on, as the desktop's (gui/cover.CoverView.arrange): in a desktop's window the
  // title's column beside the journey, the two within COVER.column, centred; the three cards share the height of the first
  // screen, from their usual row up to the one that holds the largest square picture (COVER.rowMost), and a taller card has
  // a larger picture and larger texts; the cards in the middle of the screen, the title a little above theirs. On a phone
  // (or a short or narrow window) the cover keeps style.css's own arrangement.
  let coverObserver = null, coverFrame = 0, coverFonts = false;
  function arrangeCover(tighten) {
    const nodes = page.nodes, cover = nodes.cover;
    if (!cover || !cover.isConnected || !cover.clientWidth) return;   // not on screen yet: its observer calls again
    const props = ["--lede", "--path", "--row", "--picture", "--type", "--lede-top"];
    const inner = cover.firstElementChild;
    if (arrangementOf() !== "desktop") {
      cover.classList.remove("arranged", "tight");
      for (const prop of props) cover.style.removeProperty(prop);
      inner.style.zoom = "";
      calmTracks(nodes.journey);
      return;
    }
    cover.classList.add("arranged");                                 // its page's air (style.css), tightened below if need be
    cover.classList.remove("tight");
    let style = getComputedStyle(cover);
    const outerWidth = cover.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let outerHeight = cover.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(Math.max(Math.min(window.innerWidth / COVER.screen[0], window.innerHeight / COVER.screen[1]), 1), COVER.scaleMost);
    inner.style.zoom = scale > 1 ? scale.toFixed(4) : "";           // a screen larger than a full-HD one: the whole composition larger
    const count = nodes.journey.children.length || 1;
    // where even the cards at their usual row (or as their texts lay out: tighten) would not hold the first screen (four
    // cards at 1280 x 720), the page's air above and below gives way first (gui/cover.PAGE_TIGHT), before the page scrolls
    if ((tighten === true || count * COVER.rowUsual + (count - 1) * COVER.cardGap > outerHeight / scale) && parseFloat(style.paddingTop) > COVER_TIGHT) {
      cover.classList.add("tight");
      style = getComputedStyle(cover);
      outerHeight = cover.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    }
    const available = outerWidth / scale, screen = outerHeight / scale;
    const width = Math.min(available, COVER.column);
    const lede = Math.min(Math.max(COVER.ledeShare * width, COVER.ledeLeast), COVER.ledeMost);
    const path = Math.min(width - lede - COVER.gap, COVER.path);
    const card = path - COVER.rail;
    const usual = Math.min(COVER.pictureShare * card, COVER.pictureMost);
    const tall = (height) => Math.max(usual, Math.min(height - 2 * COVER.pad, COVER.pictureTall * card,
                                                      card - 3 * COVER.pad - COVER.arrow - COVER.textLeast));
    const tallest = Math.min(2 * COVER.pad + tall(COVER.rowMost), COVER.rowMost);
    const row = Math.floor(Math.max(Math.min((screen - (count - 1) * COVER.cardGap) / count, tallest), COVER.rowUsual));
    const larger = 1 + (COVER.typeMost - 1) * Math.min(Math.max((row - COVER.rowUsual) / (COVER.rowMost - COVER.rowUsual), 0), 1);
    cover.style.setProperty("--lede", Math.round(lede) + "px");
    cover.style.setProperty("--path", Math.round(path) + "px");
    cover.style.setProperty("--row", row + "px");
    cover.style.setProperty("--picture", Math.round(Math.min(tall(row), row - 2 * COVER.padY)) + "px");
    cover.style.setProperty("--type", larger.toFixed(3));
    calmTracks(nodes.journey);                                      // at the track's size now set
    const shown = (node) => node.getBoundingClientRect().height / scale;      // layout pixels inside the zoom
    const block = shown(nodes.lede) - (parseFloat(getComputedStyle(nodes.lede).paddingTop) || 0);
    const cards = shown(nodes.journey);                             // as tall as the cards' texts need, at least `row` each
    const beside = Math.max(screen - cards, 0) / 2 + 0.4 * (cards - block);
    cover.style.setProperty("--lede-top", Math.round(Math.min(Math.max(beside, 0), Math.max(screen - block, 0))) + "px");
    if (tighten !== true && !cover.classList.contains("tight") && cards > screen + 1) arrangeCover(true);   // texts taller than a row
  }

  // What each step is worth, under the track's names on one line each (gui/cover.BenchTile.shown_worth): every text
  // said, centred under its stop, or none at all on a card (.calm: a narrow card stays calm) where two neighbours would
  // come closer than WORTH_GAP or the first or the last would leave the card's texts. Never wrapped, so a card keeps its
  // height and four cards hold the first screen after their passes too.
  const WORTH_GAP = 8;
  function calmTracks(journey) {
    for (const track of journey ? journey.querySelectorAll(".track") : []) {
      track.classList.remove("calm");
      const stops = [...track.querySelectorAll(".stop")];
      if (!stops.length || !track.offsetParent) continue;
      const step = stops[0].getBoundingClientRect().width;
      const room = track.parentNode.getBoundingClientRect().width;
      const widths = stops.map((stop) => { const worth = stop.querySelector(".track-worth"); return worth ? worth.getBoundingClientRect().width : 0; });
      const crowded = widths.some((a, k) => k && a && widths[k - 1] && (a + widths[k - 1]) / 2 + WORTH_GAP > step);
      const out = widths.some((w, k) => w && (step * (k + 0.5) - w / 2 < 0 || step * (k + 0.5) + w / 2 > room));
      track.classList.toggle("calm", crowded || out);
    }
  }

  function coverCard(card) {
    const picture = coverPicture(card.picture);
    const name = el("div", { class: "card-name" }, el("span", {}, card.title));
    if (WIRE.passed(card)) name.append(passMark(WIRE.passedText(card)));     // gui/cover's badge, after the name
    const track = el("ol", { class: "track" });
    card.track.forEach((stop, index) => {
      if (index) track.append(el("li", { class: "track-line " + (card.track[index - 1].state === "done" ? "lit" : ""), "aria-hidden": "true" }));
      const worth = stop.worth ? el("span", { class: "track-worth kind-" + stop.worth[1] }, stop.worth[0]) : null;
      track.append(el("li", { class: "stop " + stop.state, "aria-label": stop.tip },
                      el("span", { class: "stop-mark", "aria-hidden": "true" }, stop.state === "done" ? icon("check") : null),
                      el("span", { class: "stop-name" }, stop.name), worth));
    });
    const open = () => { if (!card.locked) ask("open", { bench: card.key }); else showTipOf(button); };
    // the bench's facts under its name (responses.facts: its inputs, objectives, constraints), read with the card as its
    // sentence is
    const facts = card.facts ? el("span", { class: "card-facts" }, card.facts) : null;
    const button = el("button", { class: "bench-card" + (card.locked ? " locked" : ""), type: "button", "data-bench": card.key,
                                  "aria-disabled": card.locked ? "true" : null, onclick: open },
                      el("span", { class: "node", "aria-hidden": "true" }, card.number), picture,
                      el("span", { class: "card-texts" }, name, facts, el("span", { class: "challenge" }, card.challenge), track),
                      card.locked ? icon("padlock", "card-lock") : el("span", { class: "arrow", "aria-hidden": "true" }, "→"));
    setTip(button, card.locked ? card.lock_tip : card.open_tip);
    return el("li", { class: "journey-stop" }, button);
  }

  function coverPicture(picture) {
    const [x0, x1, y0, y1] = picture.window;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    // a picture of equal scales (cover.Picture.equal: bench 4's objective space) keeps its window's shape, in the middle
    // of the well (gui/cover.picture_box); any other fills the well
    const tall = picture.equal ? 100 * (y1 - y0) / (x1 - x0) : 100;
    svg.setAttribute("viewBox", `0 0 100 ${tall.toFixed(3)}`);
    svg.setAttribute("preserveAspectRatio", picture.equal ? "xMidYMid meet" : "none");
    svg.setAttribute("class", "picture");
    svg.setAttribute("aria-hidden", "true");
    const sx = (x) => ((x - x0) / (x1 - x0)) * 100, sy = (y) => tall - ((y - y0) / (y1 - y0)) * tall;
    for (const mark of picture.marks) {
      if (mark.kind === "dots") {
        for (const [x, y] of mark.points) {
          const dot = document.createElementNS(ns, "circle");
          dot.setAttribute("cx", sx(x).toFixed(2)); dot.setAttribute("cy", sy(y).toFixed(2));
          dot.setAttribute("r", mark.small ? SMALL_DOT.toFixed(2) : "1.5");     // one of many (cover.Mark.small): smaller
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
    const full = el("a", { class: "quiet-button", href: "qr.html", target: "_blank", rel: "noopener noreferrer" }, text("web.qr.full"));
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
  function drawBench(view, meta, pixels, done, blockPixels) {
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
    for (const old of bar.querySelectorAll(".busy-note")) if (old !== page.nodes.busy) old.remove();
    if (page.layout === "desktop" && page.nodes.busy.parentNode !== bar) bar.insertBefore(page.nodes.busy, bar.querySelector(".sound"));
    if (meta && meta.width) {
      if (done && done.size) page.asked = done.size;
      drawFigure(meta, pixels);
    }
    if (meta && meta.blocks) {
      if (done && done.size) page.blocksAsked = done.size[WIRE.sizeBlocks] || null;
      drawBlocks(WIRE.blockMeta(meta), blockPixels);
    }
    if (page.nodes.blockCards) {                                    // a block on show with no picture yet: the next asks for all
      page.needBlocks = Object.values(page.nodes.blockCards).some((card) => !card.node.hidden && !card.holder.hidden && !card.canvas.width);
    }
    placeReveal(bench.lab);
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
    if (blocksMoved(now[WIRE.sizeBlocks])) return true;
    if (now.fit) return now.width !== asked.width || now.fit !== asked.fit || !now.aside !== !asked.aside;   // a phone: the bridge fits
    if (Math.abs(now.width - meta.width) > 1) return true;
    if (now.height === null) return false;
    if (meta.height > (asked.height || 0) + 1) return now.height > meta.height + 1;     // held at the lab's least height
    return Math.abs(now.height - meta.height) > 1;
  }

  // The blocks' room changed since the last answer asked for it (a block shown or hidden, the column taller): the size a
  // request last sent is the reference, never what the bridge answered, so that a room it cannot fill asks only once.
  function blocksMoved(now) {
    const asked = page.blocksAsked || null;
    if (!now || !asked) return !!now && !asked && !!page.nodes.blockCards && page.meta && "blocks" in page.meta;
    const keys = new Set([...Object.keys(now), ...Object.keys(asked)]);
    for (const key of keys) {
      const a = now[key], b = asked[key];
      if (!a || !b || Math.abs(a[0] - b[0]) > 1 || Math.abs(a[1] - b[1]) > 1) return true;
    }
    return false;
  }

  function scheduleFrame(playing) {
    clearTimeout(frameTimer);
    if (playing) frameTimer = setTimeout(() => ask("frame", { token: playing.token }), playing.ms);
  }

  function buildBench(view) {
    const lab = view.bench.lab;
    const nodes = page.nodes = { controls: {}, commands: {} };
    const desktop = page.layout === "desktop";
    page.needImage = true;
    page.codeShown = null;
    page.blocksAsked = null;
    const title = el("h2", { class: "lab-title" }, lab.title);
    setTip(title, lab.purpose);
    nodes.cardHeading = el("div", { class: "card-heading" });
    nodes.cardRows = el("div", { class: "card-rows" });
    nodes.card = el("div", { class: "card" }, nodes.cardHeading, nodes.cardRows);
    const body = el("div", { class: "column-body" });
    // the view's band of a bench of more than two inputs stands over the figure on the desktop (ViewBand), its controls
    // and its chip out of the column; on a phone they stay in the dock, where they fit
    const banded = (item) => desktop && WIRE.band(item);
    for (const action of lab.featured) body.append(featuredButton(action));
    for (const control of lab.controls) if (!banded(control)) body.append(controlGroup(control));
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
    for (const action of lab.chips) if (!banded(action)) chips.append(chipButton(action));
    body.append(chips);
    nodes.band = desktop ? viewBand(lab) : null;
    if (desktop) {                                                  // the step's blocks: after the chips, over the room left
      nodes.blocks = el("div", { class: "blocks", hidden: true });
      nodes.blockCards = {};
      body.append(nodes.blocks);
    }
    nodes.status = el("p", { class: "status", role: "status" });   // the verdict; what it lacks, its tooltip (no grey line)
    nodes.filled = null;
    if (lab.filled) {
      nodes.filled = el("button", { class: "filled", type: "button", onclick: () => {
        const filled = page.view.bench.lab.filled;
        const typed = flushTyped();                                 // a number still being typed counts (NumberField.flush)
        if (filled && (filled.enabled || (typed && filled.forward))) ask("action", { key: filled.key });
        else showTipOf(nodes.filled);
      } });
    }
    // the bench passed: "Next bench →" (or "Back to the cover") is the foot's filled command, the lab's own over it
    // outlined (gui/lab_views.LabView.set_next, fit_filled)
    nodes.next = el("button", { class: "filled next", type: "button", hidden: true, onclick: () => ask(WIRE.op.onward) });
    nodes.restore = el("button", { class: "restore", type: "button", onclick: () => ask("restore") }, icon("reset", "small"), el("span", {}, lab.restore.label));
    setTip(nodes.restore, lab.restore.tip);
    if (!lab.restore.shown) nodes.restore.hidden = true;

    nodes.panels = el("div", { class: "segmented panel-switch", role: "tablist", "aria-label": text("web.panels"), hidden: true });
    // the figure: named by the lab's lead, described (for assistive technology only, never on screen) by the keys that
    // act on it in this step (Lab.keyboard)
    nodes.keys = el("p", { class: "visually-hidden", id: "figure-keys" });
    nodes.canvas = el("canvas", { class: "figure", tabindex: "0", role: "img" });
    nodes.alert = el("div", { class: "alert", hidden: true });
    // "Show f" (gui/lab_views.reveal_chip): a checkable chip, its eye before its name, in the box the figure's plan keeps
    // for it at the right end of the 3D card's head (Plan.reveal); a view, never the study
    nodes.revealLabel = el("span", { class: "chip-label" });
    nodes.reveal = el("button", { class: "chip reveal-chip", type: "button", "aria-pressed": "false", hidden: true, onclick: () => {
      const reveal = WIRE.reveal(page.view.bench.lab);
      if (reveal) ask(WIRE.op.reveal, { on: !reveal.checked });
    } }, icon((WIRE.reveal(lab) && WIRE.reveal(lab).mark) || REVEAL_MARK, "mark"), nodes.revealLabel);
    if (!desktop) chips.append(nodes.reveal);                       // a phone's plan keeps no box for it: among the chips
    // the busy note: on the desktop in the bar (drawBench puts it there), never over the figure; on a phone over its box
    nodes.busy = el("div", { class: "busy-note", "aria-hidden": "true" }, text("web.busy"));
    nodes.figureBox = el("div", { class: "figure-box" }, desktop ? nodes.reveal : null, nodes.canvas, nodes.keys, nodes.alert);   // Show f: before the figure for the keyboard
    if (!desktop) nodes.figureBox.append(nodes.busy);
    nodes.figureBox.addEventListener("scroll", () => fold(nodes.figureBox, false), { passive: true });
    nodes.metrics = el("div", { class: "metrics" });
    nodes.table = el("div", { class: "lab-table", hidden: true });
    nodes.code = el("aside", { class: "code-panel", hidden: true });
    const benchNode = page.layout === "portrait" ? phoneBench(lab, title, body)
                    : page.layout === "compact" ? landscapeBench(lab, title, body) : workbench(lab, title, body);
    document.getElementById("screen").replaceChildren(benchNode);
    nodes.bench = benchNode;
    wireFigure(nodes.canvas);
    if (observer) observer.disconnect();                            // the nodes of the bench built before are gone
    if (!desktop) {
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
      observe(nodes.body);
      observe(nodes.blocks);
      if (nodes.band) observe(nodes.band);
      sizeSlot(view.bench);
      if (document.fonts && document.fonts.ready) {                 // measured again in the faces that came (the serif)
        const built = nodes;
        document.fonts.ready.then(() => { if (page.nodes === built && page.view && page.view.bench) sizeSlot(page.view.bench); });
      }
    }
  }

  // The desktop's workbench (gui/lab_views.LabView.build_column): the column (title, the card's slot, the rule; the
  // controls and the step's blocks, which scroll; the foot: the status line, the filled command, "Next bench" once the
  // bench is passed, Restore with View code at its right) beside the stage (the view's band, the figure; no strip: the
  // step's measures are its blocks').
  function workbench(lab, title, body) {
    const nodes = page.nodes;
    nodes.slot = el("div", { class: "card-slot" }, nodes.card);
    const head = el("div", { class: "column-head" }, title, nodes.slot, el("div", { class: "rule" }));
    const foot = el("div", { class: "column-foot" }, nodes.status);
    if (nodes.filled) foot.append(nodes.filled);
    foot.append(nodes.next);
    nodes.links = el("div", { class: "foot-links" }, nodes.restore);   // Restore, and View code at its right (footed)
    nodes.links.append(el("div", { class: "foot-spring" }));
    for (const link of lab.links) {
      const button = el("button", { class: "link", type: "button", onclick: () => ask("action", { key: link.key }) }, link.label);
      setTip(button, link.tip);
      nodes.links.append(button);
    }
    foot.append(nodes.links);
    const column = el("aside", { class: "column" }, head, body, foot);
    nodes.column = column;
    nodes.body = body;
    body.addEventListener("scroll", () => fold(body, false), { passive: true });   // more under its edge: the edge fades
    nodes.stage = el("section", { class: "stage" }, nodes.panels, nodes.band, nodes.figureBox, nodes.table);
    return el("div", { class: "bench desktop" }, column, nodes.stage, nodes.code);
  }

  // The pieces the two phone arrangements share (dense, style.css): the card's "i" and View code as icons; the dock (the
  // column's controls, the only thing that scrolls, the card a sheet over it, the step's title in the sheet's head: the
  // current pill names the step); the foot (the filled button, "Next bench" beside it once the bench is passed, and
  // Restore as an icon on one row, and the status line over it, over the dock's lower edge, only while it says
  // something; never a grey line); the measures' strip.
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
    nodes.footLine = el("div", { class: "foot-line", dataset: { tap: "tip" } }, nodes.status);
    nodes.restore.setAttribute("aria-label", lab.restore.label);   // its icon alone (style.css): the filled button keeps the room
    const row = el("div", { class: "foot-row" }, nodes.filled, nodes.next, nodes.restore);   // "Next bench" beside the lab's own
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
      if (control.label) group.append(labelLine(control, parts));
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
          parts.picks.append(button);
          return button;
        });
        if (control.beside && control.beside.length) group.append(el("div", { class: "picks-line" }, parts.picks));   // the line under
        else line.append(parts.picks);
      }
    } else {
      group.append(labelLine(control, parts));
      sliderParts(control, parts);
      group.append(el("div", { class: "slider-line" }, parts.value, parts.input));
    }
    page.nodes.controls[control.key] = parts;                       // no line under a control (the owner's: no grey line)
    return group;
  }

  // A control's name over its widget, with the slim copies of the commands placed on its line at its right (gui/lab_views
  // line_commands: step 2's Best basis, D or theta on the line of the control shown last among their places).
  function labelLine(control, parts) {
    const label = el("div", { class: "control-label" }, control.label);
    const copies = WIRE.onLine(control);
    if (!copies.length) return label;
    parts.copies = copies.map((action) => {
      const name = el("span", { class: "chip-label" });
      const button = el("button", { class: "chip slim", type: "button", onclick: () => ask("action", { key: action.key }) },
                        action.mark ? icon(action.mark, "mark") : null, name);
      return { key: action.key, button, label: name };
    });
    return el("div", { class: "label-line" }, label, el("div", { class: "foot-spring" }), ...parts.copies.map((copy) => copy.button));
  }

  // A slider and the text beside it. A slider read at every step it is dragged through sends each (the latest wins); one
  // read on release (a bench of more than two inputs: a slice takes seconds, gui/lab_views.slider's tracking off) sends
  // its value once it is let go, its text following the drag meanwhile (the control's texts).
  function sliderParts(control, parts) {
    parts.value = el("span", { class: "slider-value" });
    parts.input = el("input", { class: "slider", type: "range", min: "0", step: "1", "aria-label": control.label });
    setTip(parts.input, control.shortcuts ? control.fine_tip : "");
    const send = (transient) => ask("control", { key: control.key, value: Number(parts.input.value) },
                                    transient ? { transient: true, group: "slider:" + control.key } : undefined);
    parts.input.addEventListener("input", () => {
      sliderFill(parts.input);
      const now = parts.last || control;
      const texts = WIRE.texts(now);
      if (WIRE.tracking(now)) send(true);
      else if (texts && texts[Number(parts.input.value)] !== undefined) parts.value.textContent = texts[Number(parts.input.value)];
    });
    parts.input.addEventListener("pointerdown", () => { parts.dragging = true; });
    const release = () => { parts.dragging = false; };
    parts.input.addEventListener("pointerup", release);
    parts.input.addEventListener("pointercancel", release);
    parts.input.addEventListener("change", () => {
      release();
      const now = parts.last || control;
      if (!WIRE.tracking(now) && Number(parts.input.value) !== now.index) send(false);
    });
  }

  // The view's band of a bench of more than two inputs, over the figure (gui/lab_views.ViewBand): ONE line of 32 px, its
  // axes (a direction mark before the options of the horizontal axis, then of the vertical one, each option its input's
  // icon beside its name) and its sliders (each after its text, "x3 = 5.68 m", BAND_SLIDER wide), the chip that puts the
  // slice back at its right end: named while the line holds it (the room of its widest name kept, shown or not), else its
  // icon alone; two lines only where even that does not fit (fitBand). Its controls are the view's, never the study's.
  function viewBand(lab) {
    const controls = lab.controls.filter(WIRE.band);
    if (!controls.length) return null;
    const nodes = page.nodes;
    const axes = el("div", { class: "band-line band-axes" });
    const sliders = el("div", { class: "band-line band-sliders" });
    for (const control of controls) {
      const group = el("div", { class: "band-control" });
      setTip(group, control.tip);
      const parts = { group, control };
      if (control.kind === "buttons") {
        group.append(icon(BAND_MARKS[control.key] || "axis_across", "mark band-mark"));
        parts.segments = el("div", { class: "segmented band-segmented", role: "radiogroup", "aria-label": control.label });
        const icons = control.icons || [];
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
        axes.append(group);
      } else if (control.kind === "slider") {
        sliderParts(control, parts);
        parts.value.classList.add("band-value");
        group.append(parts.value, parts.input);
        sliders.append(group);
      } else {
        continue;                                                   // a band has axes and sliders only
      }
      nodes.controls[control.key] = parts;
    }
    for (const action of lab.chips.filter(WIRE.band)) {             // the chip, named, and its icon alone for a short line
      const name = el("span", { class: "chip-label" });
      const chip = el("button", { class: "chip band-chip", type: "button", onclick: () => ask("action", { key: action.key }) },
                      icon(action.mark || BAND_CHIP, "mark"), name);
      const short = el("button", { class: "transport-button band-short", type: "button", hidden: true,
                                   onclick: () => ask("action", { key: action.key }) }, icon(BAND_CHIP));
      nodes.commands[action.key] = { button: chip, kind: "band", label: name, short };
      sliders.append(chip, short);
    }
    return el("div", { class: "view-band", role: "group", "aria-label": text("web.band") }, axes, sliders);
  }

  // The band on one line with the chip named, or with its icon alone, or on two lines (the axes over the sliders), as its
  // width asks (gui/lab_views.ViewBand.fit); the chip keeps the room of its widest name, shown or not (reserve).
  function fitBand() {
    const band = page.nodes.band;
    if (!band || !band.isConnected || !band.offsetParent) return;
    const found = Object.values(page.nodes.commands).find((command) => command.kind === "band");
    const offered = !!(found && found.offered);
    const oneLine = () => {
      const items = [...band.querySelectorAll(".band-control, .band-chip, .band-short")].filter((node) => !node.hidden);
      const tops = items.map((node) => node.offsetTop + node.offsetHeight / 2);
      return !tops.length || Math.max(...tops) - Math.min(...tops) < 6;
    };
    const sliders = band.querySelector(".band-sliders");
    const holds = () => sliders.scrollWidth <= band.clientWidth - parseFloat(getComputedStyle(band).paddingLeft) + 1;
    for (const way of ["named", "short", "wrapped", "wrapped short"]) {
      band.classList.toggle("two", way.startsWith("wrapped"));
      const short = way.endsWith("short");
      if (found) {
        found.button.hidden = short;
        found.button.classList.toggle("reserve", !offered);        // its room kept while the slice is its own: not shown
        found.short.hidden = !offered || !short;
      }
      if (way === "named" || way === "short" ? oneLine() : way === "wrapped short" || holds()) break;   // two lines: the
    }                                                                                                    // chip named if it fits
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
    fillCard(nodes.cardHeading, nodes.cardRows, lab.card);
    nodes.card.hidden = !(lab.card.heading || lab.card.rows.length);
    for (const control of lab.controls) updateControl(control, lab);
    for (const action of commandsOf(lab)) updateCommand(action);
    if (nodes.stageName) {
      nodes.stageName.textContent = lab.stage;
      setTip(nodes.stageName, lab.stage);
    }
    // the status line: the verdict ("✓ Bench complete", "✗ Bench not complete") or a result discarded; what the study
    // lacks (Lab.hint) is its tooltip, never a grey line of its own (gui/lab_views.LabView.show_foot)
    nodes.status.textContent = lab.status;
    nodes.status.classList.toggle("ok", lab.status_kind === "ok");
    nodes.status.hidden = !lab.status;
    setTip(nodes.status, WIRE.statusTip(lab));
    const next = WIRE.next(lab);
    if (nodes.filled && lab.filled) {
      const filled = lab.filled;
      nodes.filled.textContent = filled.label;
      nodes.filled.setAttribute("aria-disabled", filled.enabled ? "false" : "true");
      nodes.filled.classList.toggle("disabled", !filled.enabled);
      nodes.filled.classList.toggle("demoted", WIRE.demoted(lab));  // under "Next bench": a second command, outlined
      if (filled.toggle) nodes.filled.setAttribute("aria-pressed", String(filled.checked));
      setTip(nodes.filled, filled.tip);                             // why it cannot be pressed, when it cannot (Lab.missing)
    }
    nodes.next.hidden = !next;
    if (next) {
      nodes.next.textContent = next.label;
      setTip(nodes.next, next.tip);
    }
    nodes.metrics.replaceChildren(...lab.metrics.map(metric));
    if (lab.alert) {
      nodes.alert.textContent = lab.alert.text;
      nodes.alert.className = "alert" + (lab.alert.warning ? " warning" : "");
      nodes.alert.hidden = false;
    } else {
      nodes.alert.hidden = true;
    }
    nodes.canvas.setAttribute("aria-label", lab.lead || lab.title);  // its name; the figure has no tooltip
    nodes.keys.textContent = lab.keys || "";
    if (lab.keys) nodes.canvas.setAttribute("aria-describedby", "figure-keys");
    else nodes.canvas.removeAttribute("aria-describedby");
    nodes.canvas.style.cursor = WIRE.cursor(lab);
    updateReveal(lab);
    if (lab.table) {
      nodes.table.hidden = false;
      nodes.table.replaceChildren(tableNode(lab.table));
    } else {
      nodes.table.hidden = true;
    }
    if (nodes.transport) {                                          // a row with no icon offered and no name to say
      const shown = lab.transport.some((action) => action.visible) || !!lab.stage;     // leaves: what stands under it
      nodes.transport.hidden = !shown;                              // (the table) takes its room
    }
    if (nodes.blocks) updateBlocks(WIRE.blocks(lab));
    if (nodes.footLine) {                                           // a phone: the card behind its "i", the foot's line when it says
      nodes.info.hidden = nodes.card.hidden;                        // something, an empty transport row folded away
      nodes.info.setAttribute("aria-label", lab.card.heading || lab.title);
      nodes.sheet.setAttribute("aria-label", lab.card.heading || lab.title);
      if (nodes.card.hidden) openSheet(false);
      setTip(nodes.footLine, [lab.status, WIRE.statusTip(lab)].filter(Boolean).join("\n"));
      nodes.bench.classList.toggle("said", !!lab.status);
      fold(nodes.metrics, !nodes.stage.classList.contains("beside"));
      fold(nodes.dock, false);
    }
    fitSegments();
    fitBand();
    if (nodes.body) fold(nodes.body, false);                       // the desktop's column: more under its edge, a fade
  }

  // The card of what the step works on (gui/lab_views.LabView.show_received): its heading, with what the response is
  // quietly at its right end (a row of the kind "aside"); then either the problem in its standard form (rows of the
  // kinds "goal" and "bound": its words in a muted column as wide as the widest, what they govern in the serif, the goal
  // larger and semibold, each variable in italics) or one row a label and its value, the value in its kind's ink. A row
  // of four has a tooltip of its own, its fourth.
  function fillCard(heading, rowsNode, card) {
    const rows = card.rows.filter((row) => row[2] !== "aside");
    const aside = card.rows.filter((row) => row[2] === "aside").map((row) => row[1]).join(" · ");
    heading.replaceChildren(el("span", { class: "card-heading-name" }, card.heading));
    if (aside) heading.append(el("span", { class: "card-aside", html: aside }));
    const posed = rows.some((row) => row[2] === "goal" || row[2] === "bound");
    rowsNode.classList.toggle("problem", posed);
    rowsNode.replaceChildren(...rows.map(([label, value, kind, tip]) => {
      const row = posed
        ? el("div", { class: "problem-row" }, el("span", { class: "problem-word", html: label }),
             el("span", { class: "problem-value " + (kind === "goal" ? "goal" : "bound"), html: mathematics(value) }))
        : el("div", { class: "card-row" }, el("span", { class: "card-label", html: label }), el("span", { class: "card-value kind-" + kind, html: value }));
      if (tip) setTip(row, tip);
      return row;
    }));
  }

  // A bound or a goal of the problem as a paper sets it (gui/lab_views.mathematics): each variable, a letter standing
  // alone (x, y, f, m, δ, σ, A), in italics, up to the last "]" (what follows it, a unit, stays upright). Only the text
  // between tags is touched.
  function mathematics(value) {
    const cut = value.lastIndexOf("]") + 1;
    const head = cut ? value.slice(0, cut) : value, tail = cut ? value.slice(cut) : "";
    const lone = (part) => part.replace(/[A-Za-zͰ-Ͽ]+/g, (word) => (word.length === 1 ? "<i>" + word + "</i>" : word));
    return head.split(/(<[^>]*>|&[#\w]+;)/).map((part, index) => (index % 2 ? part : lone(part))).join("") + tail;
  }

  // The card's slot, the bench's (gui/lab_views.CardSlot.room): the taller of the bench's problem as laid out (heading and
  // aside included) and of a card of the most rows a later step's received card holds, measured in the page's faces at
  // the column's width, so the same in the bench's three steps (a card of fewer rows top-aligned in it).
  function sizeSlot(bench) {
    const nodes = page.nodes, slot = WIRE.slot(bench);
    if (!nodes.slot || !slot || !nodes.slot.isConnected) return;
    const probe = (card) => {
      const heading = el("div", { class: "card-heading" }), rows = el("div", { class: "card-rows" });
      const node = el("div", { class: "card probe", "aria-hidden": "true" }, heading, rows);
      nodes.slot.append(node);
      fillCard(heading, rows, card);
      const tall = node.getBoundingClientRect().height;
      node.remove();
      return tall;
    };
    const posed = slot.problem && slot.problem.length ? probe({ heading: text("lab.lhs.problem"), rows: slot.problem }) : 0;
    const plain = probe({ heading: "x", rows: Array.from({ length: slot.rows || 0 }, () => ["x", "0", "plain"]) });
    nodes.slot.style.height = Math.ceil(Math.max(posed, plain)) + "px";
  }

  function updateControl(control, lab) {
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
        button.setAttribute("aria-disabled", locked ? "true" : "false");   // a locked option stays reachable: its tooltip says why
        button.querySelector(".segment-lock").replaceChildren(locked ? icon("padlock", "small") : "");
        setTip(button, locked || "");
      });
      rove(parts.segments);                                         // one Tab stop: the chosen option
    } else if (control.kind === "typed") {
      if (document.activeElement !== parts.input) parts.input.value = valueText(control.value);
      (parts.pickButtons || []).forEach((button, index) => {        // a quick pick says whether it is the N chosen
        button.classList.toggle("checked", control.shortcuts[index].checked);
        button.setAttribute("aria-pressed", String(!!control.shortcuts[index].checked));
      });
    } else {
      parts.value.textContent = control.text;
      const texts = WIRE.texts(control);                            // a band's slider: as wide as its widest text, so that
      if (texts && parts.value.classList.contains("band-value")) {  // nothing moves as it is dragged
        const key = language + "|" + texts.length + "|" + texts[0] + "|" + texts[texts.length - 1];
        if (parts.reserved !== key && parts.value.isConnected) {
          parts.reserved = key;
          reserveName(parts.value, texts);
        }
      }
      parts.input.max = String(Math.max(control.top, 0));
      parts.input.disabled = control.top <= 0;
      if (!parts.dragging) parts.input.value = String(control.index);
      sliderFill(parts.input);
    }
    for (const copy of parts.copies || []) {                        // the slim copies on its label's line
      const action = WIRE.onLine(control).find((each) => each.key === copy.key) || {};
      const chip = lab && lab.chips.find((each) => each.key === copy.key);
      const here = chip && WIRE.placed(chip) ? WIRE.placed(chip) === control.key : action.visible !== false;
      copy.button.hidden = !(here && (action.visible !== false));
      copy.button.disabled = action.enabled === false;
      copy.label.textContent = action.label || (chip && chip.label) || "";
      setTip(copy.button, action.tip || (chip && chip.tip) || "");
    }
  }

  function updateCommand(action) {
    const found = page.nodes.commands[action.key];
    if (!found) return;
    const button = found.button;
    if (found.kind === "band") {                                    // the band's chip (fitBand shows it, named or as its icon)
      found.offered = !!action.visible;
      button.disabled = found.short.disabled = !action.enabled;
      found.label.textContent = action.label;
      reserveName(found.label, null);
      setTip(button, action.tip);
      found.short.setAttribute("aria-label", action.label);
      setTip(found.short, action.label);
      return;
    }
    button.hidden = (!action.visible || (found.kind === "chip" && !!WIRE.placed(action))) && found.kind !== "icon";   // a chip
    button.style.visibility = !action.visible && found.kind === "icon" ? "hidden" : "";                         // placed: its copy
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

  // The room of a text's widest among those it may take (a band slider's texts; with none given, the band's chip: every
  // "lab.view.slice.*" of the catalogs, section.places' names), kept as its label's least width so that the band breaks the same way in a
  // bench's three steps and as the slice is pinned and released.
  const measure = document.createElement("canvas").getContext("2d");
  function reserveName(label, places) {
    const names = places || Object.keys(catalogs[language] || {}).filter((key) => /^lab\.view\.slice\.[a-z]+$/.test(key)).map((key) => text(key));
    if (!label.isConnected || !names.length) return;
    measure.font = getComputedStyle(label).font;
    const widest = Math.max(...names.map((name) => measure.measureText(name).width));
    label.style.minWidth = Math.ceil(widest) + "px";
  }

  function metric(item) {
    const title = el("div", { class: "metric-title" });
    if (item.color) title.append(el("span", { class: "metric-dot", style: "color:" + item.color }, "●"));
    title.append(el("span", { html: item.title }));
    const line = el("div", { class: "metric-line" }, el("span", { class: "metric-value kind-" + item.kind, html: item.value }));
    if (item.detail) line.append(el("span", { class: "metric-detail kind-" + item.detail_kind, html: item.detail }));
    const node = el("div", { class: "metric" + (item.strong ? " strong" : ""), tabindex: "0", dataset: { tap: "tip" } }, title, line);
    setTip(node, item.tip);
    return node;
  }

  // ---------------------------------------------------------------- "Show f" (gui/lab_views.show_reveal, place_reveal)
  function updateReveal(lab) {
    const nodes = page.nodes, reveal = WIRE.reveal(lab);
    if (!nodes.reveal) return;
    if (reveal) {
      nodes.revealLabel.textContent = reveal.label;
      nodes.reveal.setAttribute("aria-pressed", String(!!reveal.checked));
      setTip(nodes.reveal, reveal.tip);
    }
    placeReveal(lab);
  }

  // At the right end and the top of the box the figure's plan keeps for it (CSS pixels from the figure's top left), as
  // tall as that box; hidden where it is not offered or the plan keeps no box (never over a head or a legend).
  function placeReveal(lab) {
    const nodes = page.nodes, reveal = WIRE.reveal(lab);
    if (!nodes.reveal) return;
    if (page.layout !== "desktop") {                                // a phone: a chip of the dock, while it is offered
      nodes.reveal.hidden = !(reveal && reveal.offered);
      return;
    }
    const box = reveal && reveal.offered && reveal.box;
    nodes.reveal.hidden = !box || !page.meta || !page.meta.width;
    if (nodes.reveal.hidden) return;
    const [x, top, wide, tall] = box;
    nodes.reveal.style.height = tall + "px";
    nodes.reveal.style.left = Math.max(0, Math.round(x + wide - nodes.reveal.offsetWidth)) + "px";
    nodes.reveal.style.top = Math.max(0, Math.round(top - (page.meta.top || 0))) + "px";
  }

  // ---------------------------------------------------------------- the step's blocks (gui/blocks.py), the desktop's
  // Each block a card of the received card's look in the column, between the controls and the foot: its heading (its
  // tooltip the block's), its muted note, and the figure the lab draws, shown pixel for pixel at the device's density. A
  // block of no most takes the column's room left (the table), one whose most is above its least that room up to its most;
  // a block of a fixed height keeps it, never stretched; a most of 0 is its heading alone. A card is kept by its block's
  // key; the pointer over its figure, a press and the wheel or the slim bar of a table longer than its block go to the
  // lab (block_pointer, block_press, block_scroll).
  function updateBlocks(blocks) {
    const nodes = page.nodes, cards = nodes.blockCards;
    const order = blocks.map((block) => block.key);
    for (const block of blocks) {
      let card = cards[block.key];
      if (!card) card = cards[block.key] = blockCard(block.key);   // a new canvas: drawBench asks for its pixels (needBlocks)
      card.block = block;
      card.heading.textContent = block.title;
      setTip(card.heading, block.tip || "");
      card.note.textContent = block.note || "";
      card.note.hidden = !block.note;
      const bare = block.most === 0;
      const grows = block.most === null || block.most === undefined || block.most > block.least;
      card.holder.hidden = bare;
      card.node.classList.toggle("grows", grows && !bare);
      card.holder.style.minHeight = bare ? "" : block.least + "px";
      card.holder.style.height = grows || bare ? "" : Math.max(block.least, block.most || 0) + "px";
      card.holder.style.maxHeight = grows && block.most ? block.most + "px" : "";
    }
    const shown = [...nodes.blocks.children];
    if (shown.length !== order.length || shown.some((node, index) => node.dataset.key !== order[index])) {
      for (const card of Object.values(cards)) card.node.hidden = true;
      nodes.blocks.replaceChildren(...order.map((key) => { cards[key].node.hidden = false; return cards[key].node; }));
    }
    for (const [key, card] of Object.entries(cards)) card.node.hidden = !order.includes(key);
    nodes.blocks.hidden = !order.length;
    if (nodes.body) nodes.body.classList.toggle("blocked", !!order.length);
    nodes.blocks.classList.toggle("grows", blocks.some((block) => block.most === null || block.most === undefined || block.most > block.least));
    for (const key of order) {                                      // a card of a most never taller than its content: its
      const card = cards[key], most = card.block.most;              // margins, heading, note and the figure's most
      card.node.style.maxHeight = "";
      if (card.node.classList.contains("grows") && most) {
        const style = getComputedStyle(card.node), gap = parseFloat(style.rowGap) || 0;
        const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + card.heading.offsetHeight + gap
                       + (card.note.hidden ? 0 : card.note.offsetHeight + gap);
        card.node.style.maxHeight = Math.ceil(chrome + most) + "px";
      }
      drawScroll(card);
    }
  }

  function blockCard(key) {
    const heading = el("div", { class: "card-heading block-heading" });
    const note = el("div", { class: "block-note", hidden: true });
    const canvas = el("canvas", { class: "block-figure" });
    const thumb = el("div", { class: "block-thumb" });
    const bar = el("div", { class: "block-scroll", role: "scrollbar", "aria-orientation": "vertical", hidden: true }, thumb);
    const holder = el("div", { class: "block-plot" }, canvas);
    const node = el("section", { class: "card block", dataset: { key } }, heading, note, holder, bar);
    const card = { key, node, heading, note, holder, canvas, bar, thumb, block: null, first: 0, wheel: 0 };
    const point = (event) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const at = point(event);
      ask(WIRE.op.blockPointer, { key, kind: "move", x: at.x, y: at.y }, { transient: true, group: "block-move:" + key });
    });
    canvas.addEventListener("pointerleave", (event) => {            // its own block's group: never replaced by another's move
      if (event.pointerType === "mouse") ask(WIRE.op.blockPointer, { key, kind: "leave", x: 0, y: 0 }, { transient: true, group: "block-move:" + key });
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button > 0) return;
      const at = point(event);
      ask(WIRE.op.blockPress, { key, x: at.x, y: at.y });
    });
    const wheel = (event) => {                                      // the wheel over a table that scrolls: its rows, never the column
      const scroll = card.block && card.block.scroll;
      if (!scroll || scroll.count <= scroll.rows) return;
      event.preventDefault();
      card.wheel += event.deltaMode === 1 ? event.deltaY * WHEEL_ROW : event.deltaMode === 2 ? event.deltaY * scroll.rows * WHEEL_ROW : event.deltaY;
      const rows = Math.trunc(card.wheel / WHEEL_ROW);              // a notch of the wheel: three rows
      if (!rows) return;
      card.wheel -= rows * WHEEL_ROW;
      scrollTo(card, card.first + rows);
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    bar.addEventListener("wheel", wheel, { passive: false });
    bar.addEventListener("pointerdown", (event) => {                // the thumb dragged, or a page above or under it
      const scroll = card.block && card.block.scroll;
      if (!scroll || event.button > 0) return;
      event.preventDefault();
      const track = bar.getBoundingClientRect(), thumbBox = thumb.getBoundingClientRect();
      if (event.target !== thumb) {
        scrollTo(card, card.first + (event.clientY < thumbBox.top ? -scroll.rows : scroll.rows));
        return;
      }
      const from = event.clientY, start = card.first, travel = Math.max(track.height - thumbBox.height, 1);
      try { bar.setPointerCapture(event.pointerId); } catch (error) { /* a pointer gone already */ }
      const move = (moved) => scrollTo(card, Math.round(start + (moved.clientY - from) / travel * (scroll.count - scroll.rows)));
      const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up); };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
    return card;
  }

  // The table's first row asked of the lab (Lab.scroll_to), the bar moved at once (the lab's drawing follows).
  function scrollTo(card, first) {
    const scroll = card.block && card.block.scroll;
    if (!scroll) return;
    const to = Math.min(Math.max(first, 0), Math.max(scroll.count - scroll.rows, 0));
    if (to === card.first) return;
    card.first = to;
    placeThumb(card);
    ask(WIRE.op.blockScroll, { key: card.key, first: to }, { transient: true, group: "block-scroll:" + card.key });
  }

  // The slim bar of a table longer than its block (gui/blocks.BlockCard.show_scroll, place_scroll): in the card's right
  // margin, centred in it, from the top of the rows to their foot (the rows' band in the block's figure, Lab.scrolled);
  // hidden where every row is on show or the block names no scroll.
  function drawScroll(card) {
    const scroll = card.block && card.block.scroll;
    card.bar.hidden = !scroll || scroll.count <= scroll.rows || card.holder.hidden;
    if (card.bar.hidden) return;
    card.first = scroll.first;
    card.bar.setAttribute("aria-label", card.block.title);
    card.bar.setAttribute("aria-valuemin", "0");
    card.bar.setAttribute("aria-valuemax", String(scroll.count - scroll.rows));
    const top = card.holder.offsetTop + scroll.top;
    const high = Math.max(Math.min(scroll.height, card.holder.offsetHeight - scroll.top), 1);
    card.bar.style.left = (card.node.clientWidth - CARD_MARGIN + (CARD_MARGIN - SCROLL_WIDTH) / 2) + "px";
    card.bar.style.top = top + "px";
    card.bar.style.height = high + "px";
    placeThumb(card);
  }

  function placeThumb(card) {
    const scroll = card.block.scroll, high = parseFloat(card.bar.style.height) || 0;
    const tall = Math.max(high * scroll.rows / scroll.count, Math.min(16, high));
    const span = Math.max(scroll.count - scroll.rows, 1);
    card.thumb.style.height = tall + "px";
    card.thumb.style.top = ((high - tall) * card.first / span) + "px";
    card.bar.setAttribute("aria-valuenow", String(card.first));
  }

  // The blocks' pixels as the lab drew them (meta blocks, the worker's blockPixels), one drawn pixel to one pixel of the
  // screen; a block the lab did not draw again keeps its picture.
  function drawBlocks(meta, pixels) {
    const cards = page.nodes.blockCards || {};
    for (const [key, drawn] of Object.entries(meta)) {
      const card = cards[key];
      if (!card || !drawn) continue;
      const ratio = drawn.ratio || 1;
      const buffer = pixels[key];
      if (buffer) {
        const width = drawn.pixel_width || Math.round(drawn.width * ratio);
        const height = drawn.pixel_height || Math.round(buffer.byteLength / 4 / width);
        if (card.canvas.width !== width) card.canvas.width = width;
        if (card.canvas.height !== height) card.canvas.height = height;
        card.canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
      }
      if (card.canvas.width) {
        card.canvas.style.width = card.canvas.width / ratio + "px";
        card.canvas.style.height = card.canvas.height / ratio + "px";
        align(card.canvas, ratio === Math.min(window.devicePixelRatio || 1, MOST_RATIO));
      }
      drawScroll(card);
    }
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
      const names = { plane: text("web.panel.plane"),               // a bench of several responses: its objective space
                      space: page.view.bench.many ? text("lab.pareto.doe.space_title") : text("web.panel.space"),
                      third: text("web.panel.third." + page.view.bench.step_key) };
      const focused = nodes.panels.contains(document.activeElement);   // a tab chosen by the arrows keeps the focus
      nodes.panels.replaceChildren(...panels.map((panel) => el("button", {
        class: "segment" + (panel === page.panel ? " checked" : ""), type: "button", role: "tab", "aria-selected": String(panel === page.panel),
        onclick: () => { if (panel !== page.panel) { page.panel = panel; ask("render", {}, { transient: true, group: "render" }); } } },
        names[panel])));
      rove(nodes.panels);
      if (focused) refocus(nodes.panels);
    }
    canvas.dataset.panel = switching ? page.panel : "";
    if (nodes.figureBox.classList.contains("scrolls")) fold(nodes.figureBox, false);   // more below: its edge fades
  }

  // On a screen of 1.25 or 1.5 device pixels per CSS pixel, a box's edge may fall between two device pixels (the bar is
  // 49 CSS pixels high): the canvas is moved by that fraction, so that its pixels lie on the screen's and stay crisp.
  function snap(canvas, exact) {
    page.snapped = exact;
    align(canvas, exact);
  }

  function align(canvas, exact) {                                   // the figure's, and a block's
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
        if (page.screen === "bench") fold(page.nodes.body, false);  // the column taller or shorter: its fade follows
        if (page.screen === "bench") fitBand();                     // the band one line or two, as its width asks
        if (page.screen === "bench" && page.meta && stale()) ask("render", {}, { transient: true, group: "render" });
      });
    }
    observer.observe(node);
  }

  // The phone turned (or the window resized into another arrangement): the bench is built again. A phone's browser may
  // say so by orientationchange or by the media query alone, without a resize (the emulator does).
  function turned() {
    hideTip();                                                      // its owner has moved: a tooltip never stays where it was
    if (page.screen === "bench") fitSegments();                    // the column's or the dock's width may have changed
    if (page.screen === "bench") fitBand();
    if (page.screen === "bench") placeCode();                      // the code panel beside or over, at its width for this window
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
    placeCode();
    document.body.classList.add("code-open");
  }

  // The code panel beside the bench (as wide as codeWidth allows) or over it: again whenever the window is resized; the
  // stage then has another room, which its ResizeObserver turns into a figure drawn for it.
  function placeCode() {
    const panel = page.nodes.code;
    if (!panel || panel.hidden) return;
    const beside = codeBeside();
    panel.classList.toggle("beside", beside);
    panel.style.width = beside ? codeWidth() + "px" : "";
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
  let tipTimer = 0, tipOwner = null, pointerAt = null, touchedAt = -Infinity, leaveTimer = 0, tipClosedAt = -Infinity;
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

  // The tooltip of `node`, under it (over it where the screen ends); a tall element (a cover card, a control's group) has
  // it at the pointer, unless the keyboard brought it (`keyboard`): then at the element's own box, whatever the mouse
  // did before. `instant`: shown at once along a toolbar, without its fade.
  function showTipOf(node, keyboard, instant) {
    const words = node && node.dataset.tip;
    if (!words) return;
    clearTimeout(leaveTimer);
    tipOwner = node;
    tip.textContent = words;
    tip.classList.toggle("instant", !!instant);
    tip.hidden = false;
    let box = node.getBoundingClientRect();
    if (box.height > 120 && pointerAt && !keyboard) box = { left: pointerAt.x - 1, right: pointerAt.x + 1, top: pointerAt.y - 12, bottom: pointerAt.y + 14, width: 2, height: 26 };
    const width = Math.min(TIP_WIDTH, window.innerWidth - 16);
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
    clearTimeout(leaveTimer);
    if (!tip.hidden) tipClosedAt = performance.now();
    tip.hidden = true;
    tipOwner = null;
  }

  // The mouse: a tooltip waits TIP_DELAY, or none when one was shown less than TIP_AGAIN ago (along a toolbar: at once,
  // without its fade). WCAG 1.4.13: the tooltip shown stays while the pointer is on it, and while the pointer crosses
  // what lies between its owner and it (TIP_GRACE: nothing with a tip, or the owner's group around it).
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(tipTimer);
    if (tip.contains(event.target)) { clearTimeout(leaveTimer); return; }     // on the tooltip: it stays
    const node = event.target.closest && event.target.closest("[data-tip]");
    if (node && node === tipOwner) { clearTimeout(leaveTimer); return; }
    const shown = !tip.hidden;
    if (shown && (!node || node.contains(tipOwner))) {                // leaving towards the tooltip, maybe: a moment first
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { hideTip(); if (node && node.isConnected) showTipOf(node, false, true); }, TIP_GRACE);
      return;
    }
    if (!node) return;
    if (shown || performance.now() - tipClosedAt < TIP_AGAIN) { showTipOf(node, false, true); return; }
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
    const keyboard = event.target.matches && event.target.matches(":focus-visible");   // the element focused, not its group
    if (node && keyboard && performance.now() - touchedAt > 800) showTipOf(node, true);
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
