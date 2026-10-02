import { writeFileSync } from "node:fs";
import { play } from "./pass10-support.js";
import { applyVariant, type VariantId } from "../src/dev/follow-choice-variants.js";
/**
 * Offline prompt ablation for the invitation turn (no provider call): writes the exact prompt snapshots and the diffs between them.
 * production = Pass 10 production note; pass9_note = the previous note; away_labels and invited_first are hypothetical, NOT in production.
 */
const out = process.argv[2] ?? "docs/evaluations/pass10";
const r = await play("Nicco goes down the stairs into the main hall.", "I go down to the main hall. Maren, come with me.");
const ctx = { from: "Observation room", to: "Main hall", who: "Maren" };
const ids: VariantId[] = ["pass9_note", "production", "away_labels", "invited_first"];
const text = Object.fromEntries(ids.map(id => [id, applyVariant(id, r.prompt, ctx)])) as Record<VariantId, string>;
for (const id of ids) writeFileSync(`${out}/prompt-${id}.txt`, text[id]);
const diff = (a: string, b: string) => { const x = a.split("\n"), y = b.split("\n"), o: string[] = []; for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { if (x[i] !== undefined) o.push(`- ${x[i]}`); if (y[i] !== undefined) o.push(`+ ${y[i]}`); } return o.join("\n"); };
writeFileSync(`${out}/prompt-diff-pass9_note-to-production.txt`, diff(text.pass9_note, text.production));
writeFileSync(`${out}/prompt-diff-production-to-away_labels.txt`, diff(text.production, text.away_labels));
writeFileSync(`${out}/prompt-diff-production-to-invited_first.txt`, diff(text.production, text.invited_first));
console.log(Object.fromEntries(ids.map(id => [id, text[id].length])));
