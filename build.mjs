// Print every *_cheatsheet.html to A3 landscape + A3 portrait PDFs.
// Usage: node build.mjs [sheet.html ...]      (Node 22+, Google Chrome; no npm deps)
// Drives headless Chrome over the DevTools protocol so it can wait for fit.js
// to finish sizing the page before printing.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sheets = process.argv.length > 2
  ? process.argv.slice(2).map((f) => resolve(f))
  : readdirSync(here).filter((f) => f.endsWith("_cheatsheet.html")).map((f) => join(here, f));

const profile = mkdtempSync(join(tmpdir(), "cheatsheet-chrome-"));
const proc = spawn(chrome, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port;
for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, "DevToolsActivePort");
  if (existsSync(f)) port = readFileSync(f, "utf8").split("\n")[0];
  else await sleep(100);
}
if (!port) throw new Error("Chrome did not start");

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;

try {
  for (const sheet of sheets) {
    for (const orient of ["landscape", "portrait"]) {
      const url = pathToFileURL(sheet).href + (orient === "portrait" ? "?portrait" : "");
      await send("Page.navigate", { url });
      let fit;
      for (let i = 0; i < 200 && !fit; i++) {
        await sleep(50);
        fit = await evaluate("document.readyState === 'complete' && document.documentElement.dataset.fit").catch(() => null);
      }
      if (!fit) throw new Error(`fit.js did not finish for ${url}`);
      const { data } = await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      const out = sheet.replace(/\.html$/, `_a3_${orient}.pdf`);
      writeFileSync(out, Buffer.from(data, "base64"));
      console.log(`${out.slice(here.length + 1)}  (${fit})`);
    }
  }
} finally {
  ws.close();
  proc.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
