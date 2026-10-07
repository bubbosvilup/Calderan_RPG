// Anime Portrait Model Benchmark V1: contact sheets (named + blinded) rendered by headless Edge over CDP. No image is modified or cropped:
// each output is proportionally fitted (object-fit: contain) into a 2:3 cell; labels sit outside the image area.
//   node scripts/anime-portrait-benchmark-sheets.mjs   → saves/portrait_benchmark_anime/sheets/*.png + blind-mapping.json
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = resolve("saves/portrait_benchmark_anime"), SHEETS = join(OUT, "sheets");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const slug = id => id.replace(/[^a-z0-9]+/gi, "_");
const file = async (stage, model, label) => { const names = await readdir(join(OUT, stage)); const n = names.find(f => f.startsWith(`${slug(model)}__${label}.`)); if (!n) throw new Error(`missing ${stage}/${model}/${label}`); return join(OUT, stage, n); };
const MODELS = ["krea/krea-2-medium", "krea/krea-2-medium-turbo", "bytedance-seed/seedream-5-0-flash", "google/gemini-3.1-flash-image"];
const NAMES = { "krea/krea-2-medium": "Krea 2 Medium", "krea/krea-2-medium-turbo": "Krea 2 Medium Turbo", "bytedance-seed/seedream-5-0-flash": "Seedream 5.0 Flash (control)", "google/gemini-3.1-flash-image": "Gemini 3.1 Flash Image" };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function page(title, columns, rows) {
  const cell = 300;
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#11151d;color:#e7e9ee;font:15px/1.4 system-ui,sans-serif;padding:20px;width:max-content}
h1{font-size:18px;margin:0 0 14px}table{border-spacing:12px 10px}th{font-weight:600;color:#9aa3b5;font-size:13px;text-align:center}
td.label{width:200px;vertical-align:middle;font-weight:600}td.label small{display:block;font-weight:400;color:#9aa3b5;margin-top:4px}
.frame{width:${cell}px;height:${cell * 1.5}px;background:#0b0e14;border:1px solid #2a3140;display:flex;align-items:center;justify-content:center}
.frame img{max-width:100%;max-height:100%;object-fit:contain;display:block}.empty{color:#556}</style>
<h1>${esc(title)}</h1><table><tr><th></th>${columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr>
${rows.map(r => `<tr><td class="label">${esc(r.label)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</td>${r.images.map(i => `<td><div class="frame">${i ? `<img src="${pathToFileURL(i).href}">` : `<span class="empty">—</span>`}</div></td>`).join("")}</tr>`).join("\n")}</table>`;
}
async function render(pages) {
  const profile = await mkdtemp(join(tmpdir(), "caldrevan-sheets-"));
  const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch("http://127.0.0.1:9334/json/list")).json()).find(t => t.type === "page"); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener("open", r, { once: true }));
  let seq = 0; const waiting = new Map();
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((ok, no) => { const id = ++seq; waiting.set(id, m => m.error ? no(new Error(m.error.message)) : ok(m.result)); ws.send(JSON.stringify({ id, method, params })); });
  try {
    await cdp("Page.enable");
    for (const [name, html] of pages) {
      const htmlPath = join(SHEETS, `${name}.html`); await writeFile(htmlPath, html);
      await cdp("Page.navigate", { url: pathToFileURL(htmlPath).href }); await sleep(1500);
      const { value: size } = (await cdp("Runtime.evaluate", { expression: "({w: document.body.scrollWidth, h: document.body.scrollHeight, loaded: [...document.images].every(i => i.complete && i.naturalWidth)})", returnByValue: true })).result;
      if (!size.loaded) throw new Error(`images not loaded in ${name}`);
      await cdp("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      const { data } = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 }, captureBeyondViewport: true });
      await writeFile(join(SHEETS, `${name}.png`), Buffer.from(data, "base64")); console.log(`${name}.png ${size.w}x${size.h}`);
    }
  } finally { ws.close(); edge.kill(); }
}
await mkdir(SHEETS, { recursive: true });
// Blind mapping: CSPRNG shuffle, created once and kept (re-runs reuse it so the blinded sheets stay stable).
const mappingPath = join(OUT, "blind-mapping.json");
let mapping;
if (existsSync(mappingPath)) mapping = JSON.parse(await readFile(mappingPath, "utf8"));
else {
  const shuffled = [...MODELS]; for (let i = shuffled.length - 1; i > 0; i--) { const j = randomInt(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const finalists = ["krea/krea-2-medium", "bytedance-seed/seedream-5-0-flash"]; if (randomInt(2)) finalists.reverse();
  mapping = { stage1: Object.fromEntries(shuffled.map((m, i) => ["ABCD"[i], m])), stage2: { X: finalists[0], Y: finalists[1] } };
  await writeFile(mappingPath, JSON.stringify(mapping, null, 2));
}
const cols = ["Candidate 1", "Candidate 2", "Candidate 3"];
const stage1Rows = async (models, label) => Promise.all(models.map(async m => ({ label: label(m), images: await Promise.all(["c1", "c2", "c3"].map(c => file("stage1", m, c))) })));
const reference = join(OUT, "stage1", `${slug("google/gemini-3.1-flash-image")}__c2.png`);
await render([
  ["01-stage1-all-models", page("Stage 1 · hybrid anime + booru prompt · no reference · 3 unselected candidates per model", cols, await stage1Rows(MODELS, m => NAMES[m]))],
  ["01b-stage1-blind", page("Stage 1 · blinded (models A–D; mapping kept separately)", cols, await stage1Rows(Object.values(mapping.stage1), m => Object.entries(mapping.stage1).find(([, v]) => v === m)[0]))],
  ["02-prompt-dialect-control", page("Prompt-dialect control · same model, same character data", ["Natural-language anime", "Hybrid anime + booru (Stage 1 candidate 1)", "Hybrid + quality prefix"], await Promise.all(
    ["krea/krea-2-medium", "bytedance-seed/seedream-5-0-flash"].map(async m => ({ label: NAMES[m], images: [await file("controls", m, "natural"), await file("stage1", m, "c1"), await file("controls", m, "hybrid_quality")] }))))],
  ["03-reference-finalists", page("Stage 2 · finalists · same reference (non-finalist Stage 1 image) + same hybrid prompt", ["Reference / candidate 1", "Candidate 2", "Candidate 3"], [
    { label: "Reference image", note: "Gemini 3.1 Flash Image, Stage 1 candidate 2 (neutral: not a finalist)", images: [reference, null, null] },
    ...await Promise.all(["krea/krea-2-medium", "bytedance-seed/seedream-5-0-flash"].map(async m => ({ label: NAMES[m], images: await Promise.all(["r1", "r2", "r3"].map(r => file("stage2", m, r))) })))])],
  ["03b-reference-finalists-blind", page("Stage 2 · blinded finalists X / Y", ["Candidate 1", "Candidate 2", "Candidate 3"], [
    { label: "Reference image", images: [reference, null, null] },
    ...await Promise.all(Object.entries(mapping.stage2).map(async ([k, m]) => ({ label: k, images: await Promise.all(["r1", "r2", "r3"].map(r => file("stage2", m, r))) })))])],
]);
console.log(JSON.stringify(mapping));
