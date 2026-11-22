/*
 * Statistical Fundamentals, the web version: the worker that runs the laboratory in Python.
 *
 * Pyodide (CPython compiled to WebAssembly) from jsDelivr, at the exact version web/build.py stamps here, with NumPy
 * and matplotlib; then app.zip, the application's own package (the cores, explorers/, the catalogs), web/bridge.py,
 * web/faces.py and the faces of the figure (fonts/: Selawik), unpacked into Pyodide's file system. The faces are added
 * to matplotlib's font manager (faces.register) before the bridge is imported, since explorers/panels.py resolves its
 * faces once, at import: the figure is then set in Selawik, as the page. Every number and every picture comes from that
 * Python code, the desktop's: the page (app.js) only shows them. The worker keeps the page from freezing while Python
 * computes.
 *
 * Messages from the page: {type: "start", build}, then {type: "ask", id, request} (a request of bridge.Bridge.handle).
 * Messages to the page: {type: "progress", stage, fraction}, {type: "ready"}, {type: "failed", error}, and
 * {type: "reply", id, text, meta, pixels, blockPixels} (the view as JSON text, the figure's geometry as JSON text, and
 * its RGBA pixels as a transferred ArrayBuffer, or null when the picture on the page is still the right one; the pixels
 * of each block of the column drawn anew, {key: ArrayBuffer}, transferred too, their geometry in meta.blocks).
 */
"use strict";
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";
const APP_DIR = "/home/pyodide/app";
let pyodide = null;
let bridge = null;

function progress(stage, fraction) {
  postMessage({ type: "progress", stage, fraction });
}

async function start(build) {
  progress("python", 0.03);
  importScripts(PYODIDE + "pyodide.js");
  pyodide = await loadPyodide({ indexURL: PYODIDE });
  progress("numpy", 0.4);
  await pyodide.loadPackage("numpy");
  progress("matplotlib", 0.55);
  await pyodide.loadPackage("matplotlib");
  progress("app", 0.85);
  const response = await fetch("app.zip?v=" + encodeURIComponent(build));
  if (!response.ok) {
    throw new Error("app.zip: " + response.status + " " + response.statusText);
  }
  pyodide.unpackArchive(await response.arrayBuffer(), "zip", { extractDir: APP_DIR });
  progress("cover", 0.93);
  pyodide.runPython(
    "import sys\n" +
    "sys.path.insert(0, '" + APP_DIR + "')\n" +
    "import matplotlib\n" +
    "matplotlib.use('Agg')\n" +
    "import faces\n" +
    "faces.register('" + APP_DIR + "/fonts')\n"          // Selawik, before the bridge imports explorers/panels.py
  );
  bridge = pyodide.pyimport("bridge").Bridge();
}

function copied(array) {
  // An RGBA picture of the bridge (a NumPy array) copied out of WebAssembly's memory into an ArrayBuffer.
  const view = array.getBuffer("u8clamped");
  try {
    return new Uint8ClampedArray(view.data).buffer;
  } finally {
    view.release();
    array.destroy();
  }
}

function ask(id, request) {
  const result = bridge.handle(JSON.stringify(request));
  let text, meta, pixels = null;
  const blockPixels = {};
  const transfer = [];
  try {
    text = result.get(0);
    meta = result.get(2);
    const array = result.get(1);
    if (array !== undefined && array !== null) {
      pixels = copied(array);
      transfer.push(pixels);
    }
    const blocks = result.get(3);                                   // [(key, pixels)] of the blocks drawn anew
    if (blocks !== undefined && blocks !== null) {
      try {
        for (let i = 0; i < blocks.length; i++) {
          const pair = blocks.get(i);
          try {
            const buffer = copied(pair.get(1));
            blockPixels[pair.get(0)] = buffer;
            transfer.push(buffer);
          } finally {
            pair.destroy();
          }
        }
      } finally {
        blocks.destroy();
      }
    }
  } finally {
    result.destroy();
  }
  postMessage({ type: "reply", id, text, meta, pixels, blockPixels }, transfer);
}

onmessage = async (event) => {
  const message = event.data;                                       // only the page that made this worker can post here
  if (!message || typeof message !== "object") return;
  if (message.type === "start") {
    if (pyodide !== null) return;                                   // started once
    pyodide = false;
    try {
      await start(message.build);
      postMessage({ type: "ready" });
    } catch (error) {
      postMessage({ type: "failed", error: String(error && error.message ? error.message : error) });
    }
  } else if (message.type === "ask" && bridge !== null && Number.isInteger(message.id)) {
    try {
      ask(message.id, message.request);
    } catch (error) {
      postMessage({ type: "reply", id: message.id, text: null, meta: "{}", pixels: null, blockPixels: {},
                    error: String(error && error.stack ? error.stack : error) });
    }
  }
};
