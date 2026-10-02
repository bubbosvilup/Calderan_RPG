import { play } from "./pass10-support.js";
const variants = process.argv.slice(2);
for (const v of variants) {
  const r = await play(`Nicco goes down the stairs. ${v}`);
  console.log(r.where("maren") === "test_hall" ? "MOVE " : "none ", r.result?.narration_reconciliation?.issues.map(i => i.kind).join(",") || "-", "|", v);
}
