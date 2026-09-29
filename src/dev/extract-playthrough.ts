import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { extractPairs } from "./playthrough-csv.js";
import { CURATED_LABELS } from "./playthrough-manifest.js";
const path = process.argv[2];
if (!path) throw new Error("Usage: extract:playthrough -- <local CSV path>");
const csv = await readFile(path, "utf8"), pairs = extractPairs(csv);
const fixtures = CURATED_LABELS.map(label => {
  const pair = pairs.find(p => p.source_player_record === label.row);
  if (!pair) throw new Error(`Missing source record ${label.row}`);
  return { ...pair, ...label, review_status: "agent_authored_pending_human_review" };
});
await mkdir("tests/playthrough", { recursive: true });
await writeFile("tests/playthrough/curated.json", JSON.stringify({ source_filename: basename(path), source_sha256: createHash("sha256").update(csv).digest("hex"), source_pair_count: pairs.length, record_numbering: "One-based logical CSV record, including header. Not physical multiline file line.", fixtures }, null, 2) + "\n");
console.log(JSON.stringify({ offline: true, source_pairs: pairs.length, curated_cases: fixtures.length, output: "tests/playthrough/curated.json" }));
