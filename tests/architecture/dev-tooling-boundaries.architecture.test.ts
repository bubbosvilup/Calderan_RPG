import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "typescript";

/**
 * Dev tooling boundaries (Repository Cleanup E). Parsed with the TypeScript AST and resolved as paths, not grepped:
 *  1-2  production (src/ outside src/dev/) imports nothing from src/dev/ or scripts/;
 *  3    tests import dev tooling only from the supported folders, historical modules only from a frozen allowlist;
 *  4    historical tools are never npm commands; active tools never import historical ones;
 *  5-6  every statically known write target of an active tool is under artifacts/local/ (the listed exceptions say why), never docs/evaluations/;
 *  7    no source file names an absolute checkout path;
 *  8    no active script imports a compiled module whose source no longer exists.
 * Deterministic, offline, reads tracked files only.
 */
const tracked = execFileSync("git", ["ls-files", "-z", "--", "src", "tests", "scripts"], { encoding: "utf8" }).split("\0")
  .filter(f => /\.(?:ts|mts|js|mjs|cjs)$/.test(f) && !f.startsWith("tests/fixtures/") && existsSync(f));
const sources = new Map(tracked.map(f => [f, ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS)]));

const HISTORICAL = /^(?:src\/dev|scripts)\/historical\//;
const HISTORY = ["docs", "evaluations"].join("/");
const isDevTool = (f: string) => f.startsWith("src/dev/") || f.startsWith("scripts/");
const isActiveTool = (f: string) => isDevTool(f) && !HISTORICAL.test(f);
const isProduction = (f: string) => f.startsWith("src/") && !f.startsWith("src/dev/");

/** Relative module specifiers (static, dynamic `import()`, `export from`), resolved to the tracked source they name; `.build/` maps back to source. */
function imports(file: string): string[] {
  const out: string[] = [];
  const add = (spec: string) => {
    if (!spec.startsWith(".")) return;
    let target = normalize(join(dirname(file), spec)).replaceAll("\\", "/");
    if (target.startsWith(".build/")) target = target.slice(".build/".length);
    out.push(target.endsWith(".js") && existsSync(target.slice(0, -3) + ".ts") ? target.slice(0, -3) + ".ts" : target);
  };
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) add(n.arguments[0].text);
    // scripts/lib/browser-env.mjs `fromBuild("src/...js")` imports a compiled module by its path under .build/.
    if (ts.isCallExpression(n) && n.expression.getText() === "fromBuild" && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      const target = normalize(n.arguments[0].text).replaceAll("\\", "/");
      out.push(target.endsWith(".js") && existsSync(target.slice(0, -3) + ".ts") ? target.slice(0, -3) + ".ts" : target);
    }
    ts.forEachChild(n, visit);
  };
  visit(sources.get(file)!);
  return out;
}
const edges = tracked.flatMap(f => imports(f).map(d => [f, d] as const));

test("dev boundaries: production imports nothing from src/dev or scripts", () => {
  assert.ok(tracked.filter(isProduction).length > 100);
  assert.deepEqual(edges.filter(([f, d]) => isProduction(f) && (d.startsWith("src/dev/") || d.startsWith("scripts/"))), []);
});

/** Tests may use dev support, inspectors, benchmarks and maintenance helpers; live and historical modules only where listed (import-safe, no provider call on import). */
const TEST_DEV_FOLDERS = ["support", "inspect", "benchmark", "maintenance"];
const TEST_LIVE_ALLOWED = new Set(["src/dev/live/support.ts", "src/dev/live/reflection-benchmark.ts"]);
/** Frozen: historical modules current tests still pin (mostly the replay tests in tests/tooling/; Cleanup F kept them). This list may shrink, never grow. */
const TEST_HISTORICAL_ALLOWED = new Set([
  "controller-bakeoff-metrics", "d04-compaction-bakeoff", "d04-compressor-benchmark", "d04-context-baseline", "d04-final-live", "d04-targeted-live", "d05-live-retry",
  "evidence-quote", "follow-choice-classify", "follow-choice-variants", "historical-anchors", "historical-replay-compare", "historical-replay", "live-eval-scenarios",
  "mannerism-calibration-replay", "narrator-bakeoff", "organic-discovery",
].map(n => `src/dev/historical/${n}.ts`));
test("dev boundaries: tests import dev tooling only from the supported folders", () => {
  const bad = edges.filter(([f, d]) => f.startsWith("tests/") && d.startsWith("src/dev/")).filter(([, d]) => {
    const folder = d.split("/")[2]!;
    if (TEST_DEV_FOLDERS.includes(folder)) return false;
    if (folder === "live") return !TEST_LIVE_ALLOWED.has(d);
    if (folder === "historical") return !TEST_HISTORICAL_ALLOWED.has(d);
    return true;
  });
  assert.deepEqual(bad, []);
  const used = new Set(edges.filter(([f]) => f.startsWith("tests/")).map(([, d]) => d));
  assert.deepEqual([...TEST_HISTORICAL_ALLOWED].filter(d => !used.has(d)), [], "an allowlisted historical module is no longer used by a test: remove it from the list");
});

test("dev boundaries: historical tools are not npm commands and active tools never import them", () => {
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  assert.deepEqual(Object.entries(scripts).filter(([, v]) => /(?:src\/dev|scripts)\/historical\//.test(v)), []);
  for (const [, v] of Object.entries(scripts)) for (const m of v.matchAll(/node ((?:\.build\/)?(?:src|scripts|tests)\/\S+\.m?js)/g)) {
    const path = m[1]!.replace(/^\.build\//, "");
    assert.ok(existsSync(path) || existsSync(path.replace(/\.js$/, ".ts")), `npm script names a missing tool: ${m[1]}`);
  }
  assert.deepEqual(edges.filter(([f, d]) => isActiveTool(f) && HISTORICAL.test(d)), []);
});

/**
 * Static value of a path expression: string and template literals, `join` / `resolve` of known parts, and same-file `const` bindings.
 * `tmpdir()` is the OS temp root; anything else (argv, environment, computed values) is operator-supplied and returns undefined.
 */
function staticPath(file: string, node: ts.Expression, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text || undefined;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return staticPath(file, node.expression, depth + 1);
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText();
    if (/(?:^|\.)tmpdir$/.test(callee)) return "<os-tmp>";
    if (/(?:^|\.)(?:join|resolve)$/.test(callee) && node.arguments.length) {
      const parts: string[] = [];
      for (const a of node.arguments) { const v = staticPath(file, a, depth + 1); if (v === undefined) break; parts.push(v); }
      return parts.length ? parts.join("/").replace(/\/+/g, "/") : undefined;
    }
    return undefined;
  }
  if (ts.isIdentifier(node)) {
    let found: ts.Expression | undefined;
    const visit = (n: ts.Node): void => {
      if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === node.text && n.initializer && (ts.getCombinedNodeFlags(n) & ts.NodeFlags.Const)) found = n.initializer;
      ts.forEachChild(n, visit);
    };
    visit(sources.get(file)!);
    return found ? staticPath(file, found, depth + 1) : undefined;
  }
  return undefined;
}
const WRITE_CALLS = /(?:^|\.)(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|createWriteStream|copyFile|copyFileSync|rename|renameSync|cp|cpSync|mkdtemp|screenshot)$/;
function writeTargets(file: string): { readonly at: string; readonly path: string }[] {
  const out: { at: string; path: string }[] = [], sf = sources.get(file)!;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && WRITE_CALLS.test(n.expression.getText()) && n.arguments.length) {
      const callee = n.expression.getText(), arg = /copyFile|rename|cp/.test(callee) ? n.arguments[1] : n.arguments[0];
      const path = arg ? staticPath(file, arg) : undefined;
      if (path !== undefined) out.push({ at: `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, path: path.replace(/^\.\//, "") });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
/** Active writes outside artifacts/local/, each with its reason. */
const WRITE_EXCEPTIONS: readonly { file: string; prefix: string; why: string }[] = [
  { file: "src/dev/maintenance/extract-playthrough.ts", prefix: "tests/playthrough", why: "regenerates the curated playthrough fixture from an operator-supplied CSV (a maintenance tool by design)" },
];
test("dev boundaries: active tools write only under artifacts/local/ or the OS temp dir, never into docs/evaluations/", () => {
  const writes = tracked.filter(isActiveTool).flatMap(writeTargets);
  assert.ok(writes.length > 10);
  assert.deepEqual(writes.filter(w => w.path.startsWith(HISTORY)), []);
  const outside = writes.filter(w => !w.path.startsWith("artifacts/local") && !w.path.startsWith("<os-tmp>") && !WRITE_EXCEPTIONS.some(e => w.at.startsWith(`${e.file}:`) && w.path.startsWith(e.prefix)));
  assert.deepEqual(outside, []);
  for (const e of WRITE_EXCEPTIONS) assert.ok(writes.some(w => w.at.startsWith(`${e.file}:`) && w.path.startsWith(e.prefix)), `stale write exception ${e.file}`);
});

test("dev boundaries: no source names an absolute checkout path", () => {
  const ABSOLUTE = /\/home\/[\w.-]+\/Calderan|[A-Za-z]:\\\\?Users\\\\?[\w.-]+\\\\?Caldrevan|\/tmp\/claude-\d|\/Users\/[\w.-]+\/Calderan/;
  const bad: string[] = [];
  for (const [file, sf] of sources) {
    const visit = (n: ts.Node): void => {
      if ((ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && ABSOLUTE.test(n.text)) bad.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  assert.deepEqual(bad, []);
});

test("dev boundaries: active scripts import only compiled modules whose source still exists", () => {
  const missing = edges.filter(([f]) => isActiveTool(f) && f.endsWith(".mjs")).filter(([, d]) => !existsSync(d));
  assert.deepEqual(missing, []);
  assert.ok(edges.some(([f, d]) => f.startsWith("scripts/browser/") && d.startsWith("src/")), "the browser checks import compiled source");
});
