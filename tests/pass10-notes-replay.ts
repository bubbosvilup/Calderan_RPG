import { readFileSync } from "node:fs";
import { UNSUPPORTED_CLAIM, INSTRUCTION_LIKE } from "../src/turn/reflection.js";
/** Replays the REAL accepted reflection notes (Pass 6/7 live runs) through the Pass 10 content rules: how many would now be rejected? */
const notes = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as [string, { kind: string; label: string; text: string }][];
const hit = notes.filter(([, n]) => UNSUPPORTED_CLAIM.test(`${n.label.replaceAll("_", " ")} ${n.text}`) || INSTRUCTION_LIKE.test(n.text));
console.log(`${notes.length} accepted live notes; ${hit.length} would match a Pass 10 rule`);
for (const [f, n] of hit) console.log(`  ${f} [${n.kind}] ${n.text}`);
