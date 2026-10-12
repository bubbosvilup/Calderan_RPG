import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadWorld } from "../world/loader.js";
import { decodeSave } from "../persistence/save-format.js";
import { renderForkReportMarkdown, scanIdentityForks, type ForkScanReport } from "../campaign/identity-fork-scanner.js";

/**
 * Block 5B: READ-ONLY identity-fork scan over saved campaigns. It only READS `save.json` files (migrating in memory), never writes a save, and writes its report
 * only under the explicit --out directory. Usage: node .build/src/dev/scan-identity-forks.js [--out <dir>] <save.json | directory> ...
 */
const args = process.argv.slice(2);
const outAt = args.indexOf("--out"), out = outAt >= 0 ? args[outAt + 1] : undefined;
const roots = args.filter((a, i) => a !== "--out" && i !== outAt + 1);
async function find(path: string): Promise<string[]> {
  if (path.endsWith(".json")) return [path];
  const found: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    const p = join(path, e.name);
    if (e.isDirectory()) found.push(...await find(p)); else if (e.name === "save.json") found.push(p);
  }
  return found;
}
const world = await loadWorld("data");
const canonicalNames = new Set(world.getEntitiesByType("character").flatMap(c => c.name ? [c.name.toLowerCase()] : []));
const reports: (ForkScanReport & { source: string; mode: "validated" | "raw_unvalidated" })[] = [], skipped: { source: string; reason: string }[] = [];
for (const root of roots) for (const file of await find(root)) {
  const text = await readFile(file, "utf8");
  try {
    const { snapshot } = decodeSave(text, world);
    reports.push({ source: file, mode: "validated", ...scanIdentityForks(snapshot, canonicalNames) });
  } catch (error) {
    // A save from a different authored data set (a dev fixture) cannot be validated against this canon. The scanner only needs the character list, so it still
    // reads the file structurally (never repairs, never writes) and the report says it was not validated.
    try {
      const raw = JSON.parse(text) as { snapshot?: Record<string, unknown> };
      const snap = raw.snapshot;
      if (!snap || !Array.isArray(snap.characters)) throw error;
      const lenient = { campaign_id: String(snap.campaign_id ?? "unknown"), revision: Number(snap.revision ?? 0), characters: snap.characters, legal_statuses: snap.legal_statuses ?? [], player_characters: snap.player_characters ?? [],
        households: [], premium_characters: [], items: [], funds: [], relationships: [], knowledge: [], trade_offers: [], runtime: { scene: { world_time: { world_minute: 0 } } } } as unknown as Parameters<typeof scanIdentityForks>[0];
      reports.push({ source: file, mode: "raw_unvalidated", ...scanIdentityForks(lenient, canonicalNames) });
    } catch { skipped.push({ source: file, reason: error instanceof Error ? error.message.slice(0, 160) : "unreadable" }); }
  }
}
const summary = { scanner: "identity_fork_scanner_v1", read_only: true, saves_scanned: reports.length, saves_skipped: skipped.length, total_findings: reports.reduce((n, r) => n + r.findings.length, 0), reports, skipped };
if (out) {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "report.json"), JSON.stringify(summary, null, 2) + "\n");
  await writeFile(join(out, "report.md"), renderForkReportMarkdown(reports) + (skipped.length ? `\n## Skipped\n\n${skipped.map(s => `- ${s.source}: ${s.reason}`).join("\n")}\n` : ""));
}
process.stdout.write(JSON.stringify({ saves_scanned: summary.saves_scanned, saves_skipped: summary.saves_skipped, total_findings: summary.total_findings }, null, 1) + "\n");
