/*
 * Statistical Fundamentals, the web version: the script of qr.html, the QR code of the site's own address (drawn by
 * qrcodejs, loaded by the page with its integrity hash), its texts from the catalogs (texts.json) in the language kept.
 * Its own file, not an inline <script>: the page's Content-Security-Policy allows no inline script.
 */
"use strict";
(() => {
  const address = new URL(".", location.href).href;
  let language = "en";
  try {
    const kept = JSON.parse(localStorage.getItem("statistical-fundamentals") || "{}") || {};
    if (kept.language === "en" || kept.language === "pt_BR") language = kept.language;
    else if ((navigator.language || "").toLowerCase().startsWith("pt")) language = "pt_BR";
  } catch (error) { /* nothing kept */ }
  fetch("texts.json?v=b99704786ba7").then((response) => response.json()).then((catalogs) => {
    const text = (key, params) => {
      let found = (catalogs[language] || {})[key] ?? catalogs.en[key] ?? "[" + key + "]";
      if (params) found = found.replace(/\{(\w*)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
      return found;
    };
    document.documentElement.lang = language === "pt_BR" ? "pt-BR" : "en";
    document.getElementById("title").textContent = text("web.qr.title");
    document.getElementById("lead").textContent = text("web.qr.lead");
    document.getElementById("back").textContent = text("web.qr.back");
    document.getElementById("address").textContent = address;
    const box = document.getElementById("code");
    box.setAttribute("aria-label", address);
    try {
      new QRCode(box, { text: address, width: 512, height: 512, colorDark: "#10151C", colorLight: "#EDF2F7", correctLevel: QRCode.CorrectLevel.M });
    } catch (error) {
      box.textContent = text("web.qr.failed", { error: error.message });
    }
  });
})();
