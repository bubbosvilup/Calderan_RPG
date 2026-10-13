// Read-only documentation link checker (Repository Cleanup B). Checks every relative markdown link and image target in the tracked
// markdown files of the CURRENT documentation namespace (README.md, docs/*.md, docs/architecture/, docs/authoring/, docs/schemas/,
// docs/world/) and reports the ones whose file or directory does not exist. External URLs and pure #anchors are not checked (no network).
//   node scripts/check-doc-links.mjs            current namespace; exit 1 on a broken link
//   node scripts/check-doc-links.mjs --all      every tracked markdown file, historical evidence included (report only, never fails)
//   node scripts/check-doc-links.mjs --json     machine-readable output
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT = [/^README\.md$/, /^docs\/[^/]+\.md$/, /^docs\/(?:architecture|authoring|schemas|world)\//];
const all = process.argv.includes("--all"), json = process.argv.includes("--json");

const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
const files = tracked.filter(f => all || CURRENT.some(r => r.test(f)));

/** Markdown links outside fenced code blocks and inline code: [text](target "title") and ![alt](target). */
function links(text) {
  const out = [];
  let fenced = false;
  text.split("\n").forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const plain = line.replace(/`[^`]*`/g, m => " ".repeat(m.length));
    for (const m of plain.matchAll(/!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ line: i + 1, target: m[1] });
  });
  return out;
}
const broken = [];
let checked = 0;
for (const file of files) {
  for (const { line, target } of links(readFileSync(join(ROOT, file), "utf8"))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue; // external URL, mailto, anchor
    const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!path) continue;
    checked++;
    const absolute = path.startsWith("/") ? join(ROOT, path) : join(ROOT, dirname(file), path);
    if (!normalize(absolute).startsWith(ROOT) || !existsSync(absolute)) broken.push({ file, line, target });
  }
}
if (json) console.log(JSON.stringify({ files: files.length, links: checked, broken }, null, 1));
else {
  for (const b of broken) console.log(`${b.file}:${b.line}  ${b.target}`);
  console.log(`${files.length} files, ${checked} relative links, ${broken.length} broken${all ? " (all tracked markdown)" : " (current documentation)"}`);
}
if (!all && broken.length) process.exitCode = 1;
