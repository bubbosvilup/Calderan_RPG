import { play } from "./pass10-support.js";
for (const v of process.argv.slice(2)) {
  const r = await play(v, "I go down to the main hall.");
  console.log((r.result?.narration_reconciliation?.issues.map(i => `${i.kind}`).join(",") || "-").padEnd(24), "|", v);
}
