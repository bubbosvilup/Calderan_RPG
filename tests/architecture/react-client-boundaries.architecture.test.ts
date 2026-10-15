import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import ts from "typescript";
import { sourceFiles, toPosixPath } from "../support/source-paths.js";

/**
 * React client boundaries (UI-1). The browser app in src/ui-client/ is a renderer of server read models:
 *   1. it imports nothing outside src/ui-client/ (no engine, campaign or server module can leak into the bundle), and the server never imports it
 *      (tests may import its pure DTO module for the contract test);
 *   2. `fetch` is called only by the API client (api/client.ts), so every request goes through one error and revision policy;
 *   3. model text is never injected as HTML;
 *   4. no runtime import cycle exists inside the client;
 *   5. raw colors live only in the design tokens;
 *   6. no browser storage holds state, and the stack stays as decided (no Redux, Zustand, Tailwind, Three.js, desktop shells or component suites).
 * UI-2 adds: no clickable non-button elements, one dialog focus implementation shared by Drawer and Modal, image URLs only from the read model, and no
 * item-slot or category rules in the inventory and character features.
 * Game rules belong to the engine: components render capability flags from the read model (`can_promote_to_npc_plus`, `keepable`, `affordable`).
 */
const ROOT = "src/ui-client";
const walk = (dir: string) => sourceFiles(dir, () => true);
const files = walk(ROOT);
const code = files.filter(f => /\.tsx?$/.test(f));
const app = code.filter(f => !/\.test\.tsx?$/.test(f) && !f.startsWith(`${ROOT}/test/`) && f !== `${ROOT}/vite.config.ts`);

function specifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !(ts.isImportDeclaration(n) && n.importClause?.isTypeOnly)) out.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(source);
  return out;
}
const resolveLocal = (from: string, spec: string): string | undefined => {
  const base = toPosixPath(normalize(join(dirname(from), spec)));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(p => existsSync(p) && statSync(p).isFile());
};

test("react client: imports stay inside src/ui-client, and no server module imports it", () => {
  for (const file of code) for (const spec of specifiers(file)) {
    if (!spec.startsWith(".")) { assert.ok(file === `${ROOT}/vite.config.ts` || !spec.startsWith("node:"), `${file} imports the Node built-in ${spec}`); continue; }
    const target = toPosixPath(normalize(join(dirname(file), spec)));
    assert.ok(target.startsWith(`${ROOT}/`), `${file} imports ${spec}, outside the client`);
  }
  const server = walk("src").filter(f => !f.startsWith(`${ROOT}/`) && f.endsWith(".ts"));
  for (const file of server) assert.doesNotMatch(readFileSync(file, "utf8"), /from\s+["'][^"']*ui-client/, `${file} imports the React client`);
});

test("react client: only the API client calls fetch", () => {
  const callers = app.filter(f => /\bfetch\s*\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(callers, [`${ROOT}/api/client.ts`]);
});

test("react client: model text is never injected as HTML", () => {
  for (const file of code) assert.doesNotMatch(readFileSync(file, "utf8"), /dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write/, file);
});

test("react client: no runtime import cycle", () => {
  const graph = new Map(app.map(f => [f, specifiers(f).filter(s => s.startsWith(".")).map(s => resolveLocal(f, s)).filter((p): p is string => !!p && /\.tsx?$/.test(p))]));
  const state = new Map<string, 1 | 2>(), stack: string[] = [], cycles: string[][] = [];
  const dfs = (n: string) => {
    state.set(n, 1); stack.push(n);
    for (const d of graph.get(n) ?? []) { if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d]); else if (!state.get(d)) dfs(d); }
    stack.pop(); state.set(n, 2);
  };
  for (const n of graph.keys()) if (!state.get(n)) dfs(n);
  assert.ok(graph.size > 30);
  assert.deepEqual(cycles, []);
});

test("react client: raw colors live only in the design tokens", () => {
  const css = files.filter(f => f.endsWith(".css") && f !== `${ROOT}/styles/tokens.css`);
  assert.ok(css.length > 10);
  for (const file of [...css, ...app]) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const color = file.endsWith(".css") ? /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/ : /["'`]#[0-9a-fA-F]{3,8}["'`]|\brgba?\(|\bhsla?\(/;
    assert.doesNotMatch(text, color, `${relative(".", file)} hardcodes a color; use a token from styles/tokens.css`);
  }
});

test("react client: no browser storage, and the stack stays as decided", () => {
  for (const file of app) assert.doesNotMatch(readFileSync(file, "utf8"), /\b(?:localStorage|sessionStorage|indexedDB)\b/, file);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const banned = /^(?:redux|@reduxjs\/.*|react-redux|zustand|tailwindcss|@tailwindcss\/.*|three|@react-three\/.*|electron|@tauri-apps\/.*|@mui\/.*|antd|@chakra-ui\/.*|@mantine\/.*)$/;
  assert.deepEqual(deps.filter(d => banned.test(d)), []);
  for (const required of ["react", "react-dom", "react-router", "@tanstack/react-query", "vite"]) assert.ok(deps.includes(required), required);
});

const withoutComments = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("react client: no clickable non-button elements (controls are buttons, links and form fields)", () => {
  const offenders = app.filter(f => f.endsWith(".tsx")).filter(f => /<(?:div|span|li|p|section|article|img|header|footer|aside|main|figure)\b[^>]*\bonClick=/.test(withoutComments(f)));
  assert.deepEqual(offenders, []);
});

test("react client: one dialog focus implementation, shared by Drawer and Modal", () => {
  const trapping = app.filter(f => /key\s*===\s*["']Tab["']/.test(withoutComments(f)));
  assert.deepEqual(trapping, [`${ROOT}/hooks/useDialogFocus.ts`]);
  for (const dialog of ["components/Drawer/Drawer.tsx", "components/Modal/Modal.tsx"]) assert.match(readFileSync(`${ROOT}/${dialog}`, "utf8"), /useDialogFocus/, dialog);
});

test("react client: image URLs come from the read model, never assembled in the client", () => {
  const assembled = /["'`]\/api\/(?:portrait\/asset|inventory\/sprite|item-glyph|canon-avatar)/;
  assert.deepEqual(app.filter(f => assembled.test(withoutComments(f))), []);
});

test("react client: inventory and character features carry no item-slot or category rules", () => {
  const features = app.filter(f => /\/features\/(?:inventory|character)\//.test(f));
  assert.ok(features.length >= 8);
  // Slot and category knowledge (weapon/armor/headwear/footwear -> head/chest/weapon/boots) lives in the engine's Inventory read model.
  for (const file of features) assert.doesNotMatch(withoutComments(file), /["'`](?:weapon|armor|headwear|footwear|consumable|valuable)["'`]|equipmentSlotFor|SLOT_BY_CATEGORY|EQUIPMENT_SLOTS/, file);
});

test("react client: the player is never an NPC+ in the client (no premium or NPC+ record is required for the player page)", () => {
  const files = app.filter(f => /\/features\/character\//.test(f));
  for (const file of files) assert.doesNotMatch(withoutComments(file), /premium_characters|npc_plus|npcPlus|NPC\+/, file);
});

test("React client: no two modules in a folder share a base name apart from case (Windows and macOS resolve `./Name` to either)", () => {
  const seen = new Map<string, string>();
  for (const file of sourceFiles("src/ui-client").map(toPosixPath).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
    const key = file.replace(/\.(ts|tsx)$/, "").toLowerCase();
    const earlier = seen.get(key);
    assert.ok(!earlier || earlier === file.replace(/\.(ts|tsx)$/, ""), `${file} collides with ${earlier} on a case-insensitive file system`);
    seen.set(key, file.replace(/\.(ts|tsx)$/, ""));
  }
});
