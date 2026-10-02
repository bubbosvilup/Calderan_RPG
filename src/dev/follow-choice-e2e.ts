import { readFileSync, writeFileSync } from "node:fs";
import { turnFixture } from "./turn-fixture.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { characterLocation } from "../turn/character-movement.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { GenerationRequest } from "../llm/types.js";
import type { TurnResult } from "../turn/turn-types.js";

/**
 * Follow-choice live validation, OFFLINE end-to-end (no paid calls): replays recorded RAW production drafts through the real turn pipeline
 * on the probe's exact baseline (Nicco, Brenna, Maren, Gerome in the Observation room; all three active NPC+). The narrator is a mock that
 * returns the recorded draft (and the same text for any revision); the controller either proposes nothing or a move_character with a
 * verbatim quote. Also runs the regression sentences. Usage: node .build/src/dev/follow-choice-e2e.js <ids-json> <out.json>
 */
const [idsFile, outFile] = process.argv.slice(2);
const live = readFileSync("docs/evaluations/pass10/follow-choice-live.jsonl", "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { variant: string; invitation: number; sample: number; invitation_text: string; output: string });
const picks = JSON.parse(readFileSync(idsFile!, "utf8")) as { variant: string; invitation: number; sample: number; follower: string; quote: string }[];
const meta = { model: "replay", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 } };
async function replay(input: string, draft: string, commands: readonly CampaignCommand[], evidence: readonly string[]) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...["brenna", "maren", "gerome"].map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id }))] });
  const service = new RetrievalService(f.world);
  const narrator = { async generate(_r: GenerationRequest) { return { text: draft, ...meta }; }, async *stream(_r: GenerationRequest) { yield { type: "text_delta" as const, text: draft }; yield { type: "completed" as const, result: { text: draft, ...meta } }; } };
  const co = new TurnCoordinator(f.world, narrator, { async propose() { return { commands, evidence, ...meta }; } }, { service, search: new HybridSearch(service) });
  let result: TurnResult | undefined;
  for await (const e of co.runTurn({ campaign: f.campaign, player_input: input })) if (e.type === "turn_completed") result = e.result;
  const s = f.campaign.exportSnapshot();
  const moved = (id: string) => s.premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved").length ?? 0;
  return { ok: !!result, nicco: s.runtime.scene.player_location, locations: Object.fromEntries(["brenna", "maren", "gerome"].map(id => [id, characterLocation(s, f.world, id)])),
    moved: Object.fromEntries(["brenna", "maren", "gerome"].map(id => [id, moved(id)])), movement_evidence: result?.turn_evidence.character_movements?.map(m => `${m.character_id}->${m.location_id}`) ?? [],
    decisions: result?.authorization.map(d => `${d.command.kind}:${d.authorized ? "ok" : d.reason}`) ?? [], delivered: result?.narration_reconciliation?.delivered, issues: result?.narration_reconciliation?.issues.map(i => `${i.kind}:${i.character ?? ""}`) ?? [] };
}
const out: unknown[] = [];
for (const p of picks) {
  const row = live.find(r => r.variant === p.variant && r.invitation === p.invitation && r.sample === p.sample)!;
  const id = p.follower.toLowerCase();
  const none = await replay(row.invitation_text, row.output, [], []);
  const proposed = await replay(row.invitation_text, row.output, [{ kind: "move_character", character_id: id, location_id: "test_hall" }], [p.quote]);
  const wrong = await replay(row.invitation_text, row.output, [{ kind: "move_character", character_id: id, location_id: "test_remote" }], [p.quote]);
  out.push({ ...p, no_controller_proposal: none, controller_move_with_quote: proposed, controller_wrong_destination: wrong });
}
// Regression sentences on the exact production state (Maren invited; Nicco moves to the Main hall).
const input = "I go down to the main hall. Maren, come with me.", base = "The stairs creak underfoot as Nicco descends into the main hall.";
const regressions: Record<string, unknown> = {};
for (const [label, text] of [["invitation alone", base], ["she stays", `${base} Maren stays.`], ["she hesitates", `${base} Maren hesitates.`], ["no footsteps follow", `${base} No footsteps follow.`],
  ["her eyes follow him", `${base} Maren's eyes follow him.`], ["follows his reasoning", `${base} Maren follows his reasoning.`], ["completed valid follow", `${base} Maren follows him down.`]] as const)
  regressions[label] = await replay(input, text, [], []);
writeFileSync(outFile!, JSON.stringify({ follows: out, regressions }, null, 2) + "\n");
console.log(JSON.stringify({ follows: out.length }));
