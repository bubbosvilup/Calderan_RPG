import { grammarProbe } from "./pass10-support.js";
import { positiveCorpus, negativeCorpus, nonMoverCorpus, UNSUPPORTED_ORNATE } from "./pass10-corpus.js";
const tally = (cases: ReturnType<typeof positiveCorpus>, probe: (s: string) => string[], expectMove: boolean, label: string) => {
  const bad = cases.filter(c => (probe(`Nicco goes down the stairs. ${c.text}`).length > 0) !== expectMove);
  const by = new Map<string, number>(); for (const b of bad) by.set(b.family, (by.get(b.family) ?? 0) + 1);
  console.log(`${label}: ${cases.length} cases, ${bad.length} ${expectMove ? "false negatives" : "FALSE POSITIVES"}`, Object.fromEntries(by));
  return bad;
};
const single = grammarProbe({ members: ["maren"] }), two = grammarProbe({ members: ["brenna", "maren"] });
const fn = tally(positiveCorpus("Maren"), single, true, "positive/name (single NPC+)");
tally(positiveCorpus("Maren"), two, true, "positive/name (two NPC+)");
tally(positiveCorpus("She", "Her"), single, true, "positive/pronoun (one woman)");
tally(positiveCorpus("She", "Her"), two, false, "positive-shaped/pronoun with two women (must fail closed)");
tally(negativeCorpus("Maren"), single, false, "negative/name"); tally(negativeCorpus("She"), single, false, "negative/pronoun");
tally(nonMoverCorpus(), single, false, "non-mover");
const show = process.argv[2] === "fn" ? fn.slice(0, 60) : [];
for (const c of show) console.log("  FN:", c.text);
if (process.argv[2] === "fp") for (const c of [...negativeCorpus("Maren")].filter(c => single(`Nicco goes down the stairs. ${c.text}`).length)) console.log("  FP:", c.family, "|", c.text);
if (process.argv[2] === "stepfn") for (const c of positiveCorpus("Maren").filter(c => c.family === "positive:step-led" && !single(`Nicco goes down the stairs. ${c.text}`).length).slice(0, 40)) console.log("  STEP FN:", c.text);

for (const t of UNSUPPORTED_ORNATE.map(x => x.replaceAll("{S}", "Maren"))) console.log(single(`Nicco goes down the stairs. ${t}`).length ? "  RECOGNISED:" : "  unsupported:", t);
