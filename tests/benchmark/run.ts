import { runAll, render } from "./runner.js";
import { SCENARIOS } from "./scenarios.js";

/** `npm run benchmark:modern [-- --only M1,P1] [-- --verbose]`. Exit code 1 when any scenario FAILS (a known product gap is not a failure). */
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith("--only="))?.slice(7) ?? (args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined))?.split(",").filter(Boolean);
const summary = await runAll(SCENARIOS, only);
console.log(render(summary, args.includes("--verbose")));
process.exitCode = summary.failed ? 1 : 0;
