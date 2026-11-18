// One-off helper: drives a headless Chrome instance over the raw DevTools
// Protocol (no puppeteer dependency) to capture real, authentic in-game
// screenshots for the Play Store listing. Not part of the normal build —
// run manually with `node tools/capture-screenshots.js <url> <outDir>`.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const URL = process.argv[2] || "http://localhost:8924/index.html";
const OUT = process.argv[3] || path.join(__dirname, "..", "store-assets", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function openTab(url) {
  const res = await fetch("http://localhost:" + PORT + "/json/new?" + encodeURIComponent(url), { method: "PUT" });
  return res.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
  });
}

function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    function onMsg(ev) {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    }
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}

async function rectOf(ws, selector) {
  const res = await send(ws, "Runtime.evaluate", {
    expression: "(function(){var e=document.querySelector(" + JSON.stringify(selector) + ");if(!e)return null;var r=e.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()",
    returnByValue: true
  });
  if (!res.result.value) return null;
  return JSON.parse(res.result.value);
}

async function click(ws, x, y) {
  await send(ws, "Input.dispatchMouseEvent", { type: "mousePressed", x: x, y: y, button: "left", clickCount: 1 });
  await send(ws, "Input.dispatchMouseEvent", { type: "mouseReleased", x: x, y: y, button: "left", clickCount: 1 });
}

async function shot(ws, name) {
  const res = await send(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(res.data, "base64"));
  console.log("saved " + name);
}

(async () => {
  // Headless Chrome's --window-size IS the viewport (no OS chrome around
  // it), so a phone-sized window gets the game's actual mobile layout —
  // this is simpler and more reliable than Emulation.setDeviceMetricsOverride,
  // which raced against the tab's navigation (started the instant /json/new
  // opened it) and left the page laid out at the pre-override size.
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
    "--remote-debugging-port=" + PORT, "--window-size=412,892", "about:blank"
  ], { stdio: "ignore" });
  await wait(1200);

  try {
    const tab = await openTab(URL);
    const ws = await connect(tab.webSocketDebuggerUrl);
    await send(ws, "Page.enable");
    await wait(1400);

    await shot(ws, "01-menu.png");

    var r = await rectOf(ws, "#btnMenuCampaign");
    await click(ws, r.x, r.y);
    await wait(500);
    await shot(ws, "02-campaign-select.png");

    r = await rectOf(ws, ".level-card:not(.locked)");
    if (r) { await click(ws, r.x, r.y); await wait(700); await shot(ws, "03-gameplay.png"); }

    r = await rectOf(ws, "#btnShop");
    if (r) {
      await send(ws, "Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
      await send(ws, "Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
      await wait(500);
      await shot(ws, "04-shop.png");
    }

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
