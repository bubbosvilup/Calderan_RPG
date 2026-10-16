// node:test reporter for CI: collects only the failing leaf tests and writes a concise, grep-able diagnostic.
//   per failure: test file, test name, first error line, first stack location inside this repository
// Output: `artifacts/ci/test-failures.txt` (uploaded by the workflow when a job fails) and a summary on stdout after the run.
// It adds information only; it changes no test, assertion or exit code. Use next to the normal reporter:
//   node --test --test-reporter=tap --test-reporter-destination=stdout --test-reporter=./scripts/ci/test-failure-reporter.mjs --test-reporter-destination=stdout ...
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "artifacts", "ci", "test-failures.txt");

const posix = value => value.split(sep).join("/");
const rel = value => {
  const path = value.startsWith("file://") ? fileURLToPath(value) : value;
  return path.startsWith(ROOT) ? posix(relative(ROOT, path)) : posix(path);
};

/** The first stack frame that points into this repository (not node internals, not node_modules). */
function firstLocation(stack) {
  for (const line of String(stack ?? "").split("\n")) {
    const match = line.match(/\(?((?:file:\/\/)?(?:[A-Za-z]:)?[^()\s]*?[\\/][^()\s]*?:\d+:\d+)\)?\s*$/);
    if (!match || /node:internal|node_modules/.test(match[1])) continue;
    return rel(match[1]);
  }
  return "(no repository frame)";
}

const oneLine = text => String(text ?? "").split("\n").find(line => line.trim()) ?? "";

export default async function* reporter(source) {
  const failures = [];
  let total = 0, passed = 0;
  for await (const event of source) {
    if (event.type === "test:pass") { total++; passed++; }
    if (event.type !== "test:fail") continue;
    total++;
    const error = event.data.details?.error;
    const cause = error?.cause instanceof Error ? error.cause : error;
    // A parent test whose subtests failed is not a failure of its own; the failing leaves are reported.
    if (error?.failureType === "subtestsFailed") continue;
    failures.push({
      file: event.data.file ? rel(event.data.file) : "(unknown file)",
      name: event.data.name,
      message: oneLine(cause?.message ?? error?.message),
      location: firstLocation(cause?.stack ?? error?.stack),
      code: cause?.code ?? error?.code ?? "",
    });
  }
  const lines = [`Failing tests: ${failures.length} (of ${total} reported, ${passed} passed)`, ""];
  for (const f of failures) lines.push(`FILE  ${f.file}`, `TEST  ${f.name}`, `ERROR ${f.code ? `[${f.code}] ` : ""}${f.message}`, `AT    ${f.location}`, "");
  const text = lines.join("\n");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  if (failures.length) yield `\n===== FAILURE DIAGNOSTIC (${posix(relative(ROOT, OUT))}) =====\n${text}===== END FAILURE DIAGNOSTIC =====\n`;
}
