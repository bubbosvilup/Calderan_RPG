import { readFileSync } from "node:fs";
import { grammarProbe } from "./pass10-support.js";
/** Replays real delivered narration sentences (Pass 8/9 live runs) through the movement grammar on a "Nicco moved" scene. */
const file = process.argv[2]!;
const sentences = JSON.parse(readFileSync(file, "utf8")) as string[];
const settings = { all3: grammarProbe({ members: ["brenna", "maren", "gerome"] }), maren_only: grammarProbe({ members: ["maren"] }), brenna_only: grammarProbe({ members: ["brenna"] }) };
const hits: string[] = [];
for (const s of sentences) for (const [k, probe] of Object.entries(settings)) { const m = probe(`Nicco goes down the stairs. ${s}`); if (m.length) hits.push(`${k} ${m.join(",")} | ${s}`); }
console.log(sentences.length, "sentences;", hits.length, "movement detections");
for (const h of hits) console.log(h);
