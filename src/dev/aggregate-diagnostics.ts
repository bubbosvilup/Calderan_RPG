import { readFile, writeFile } from "node:fs/promises";
import { aggregate, parseJsonl, renderMarkdown, type TokenPrices } from "./diagnostics-aggregate.js";

/** Usage: node .build/src/dev/aggregate-diagnostics.js <records.jsonl> [--json out.json] [--md out.md] [--price-narrator-in 0.5 --price-narrator-out 1.5 --price-controller-in 0.1 --price-controller-out 0.3] (USD per million tokens) */
const args = process.argv.slice(2), input = args[0];
if (!input || input.startsWith("--")) { console.error("usage: aggregate-diagnostics <records.jsonl> [--json file] [--md file] [--price-* usd_per_million]"); process.exit(2); }
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const price = (name: string) => { const v = flag(name); return v === undefined ? undefined : Number(v); };
const prices: TokenPrices = { narrator_input: price("--price-narrator-in"), narrator_output: price("--price-narrator-out"), controller_input: price("--price-controller-in"), controller_output: price("--price-controller-out") };
const result = aggregate(parseJsonl(await readFile(input, "utf8")), prices);
const json = flag("--json"), md = flag("--md");
if (json) await writeFile(json, JSON.stringify(result, null, 2) + "\n");
if (md) await writeFile(md, renderMarkdown(result));
if (!json && !md) process.stdout.write(renderMarkdown(result));
