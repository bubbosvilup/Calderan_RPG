import { readFile, writeFile } from "node:fs/promises";
import { turnFixture } from "./turn-fixture.js";
import { DiscoveryAggregate, MotifTracker, observeOrganicTurn, type ObservedTurn } from "./organic-discovery.js";
import type { CampaignSnapshot } from "../campaign/types.js";

/**
 * NPC+ Pass 8: re-run the evaluation observer over a recorded live run's replay dump (no provider calls). The dump holds each turn's
 * base/final snapshots and the observed TurnResult fields; it is written to scratch by eval-organic-discovery --replay-out.
 * Usage: node .build/src/dev/replay-organic-discovery.js <replay.jsonl> <summary-out.json> [<review-out.jsonl>]
 */
const [file, summaryOut, reviewOut] = process.argv.slice(2);
if (!file || !summaryOut) throw new Error("usage: replay-organic-discovery <replay.jsonl> <summary-out.json> [<review-out.jsonl>]");
const { world } = turnFixture();
const aggregate = new DiscoveryAggregate(), motifs = new Map<string, MotifTracker>(), review: string[] = [];
for (const line of (await readFile(file, "utf8")).split("\n").filter(Boolean)) {
  const r = JSON.parse(line) as { session: string; turn: number; input: string; before: CampaignSnapshot; after: CampaignSnapshot; observed: ObservedTurn };
  const { diagnostics, review: rv } = observeOrganicTurn({ world, before: r.before, after: r.after, player_input: r.input, turn: r.observed });
  aggregate.add(diagnostics);
  const tracker = motifs.get(r.session) ?? new MotifTracker(); motifs.set(r.session, tracker); tracker.record(r.turn, diagnostics);
  review.push(JSON.stringify({ session: r.session, turn: r.turn, input: r.input, ...rv }));
}
const sessions = [...motifs].map(([session, t]) => ({ session, motifs: t.motifs(), unrepresented_recurring: t.unrepresented() }));
await writeFile(summaryOut, JSON.stringify({ ...aggregate, sessions }, null, 2) + "\n");
if (reviewOut) await writeFile(reviewOut, review.join("\n") + "\n");
console.log(JSON.stringify({ outcomes: aggregate.outcomes, counts: aggregate.counts }));
